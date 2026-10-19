package com.cwtrainer.pocket;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Two independently testable playback paths. Default is a temporary PCM WAV
 * played by Android MediaPlayer; fallback is streaming AudioTrack.
 * Never silently swallow playback errors.
 */
public final class MorseTonePlayer {
    public interface Listener { void onAudioStatus(String status); }
    static final int SAMPLE_RATE = 44100;
    private static final int FREQUENCY = 650;
    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicInteger generation = new AtomicInteger();
    private final Object lock = new Object();
    private MediaPlayer player;
    private AudioTrack track;
    private File lastFile;
    private volatile boolean useStream = false;

    public MorseTonePlayer(Context context, Listener listener) {
        this.context=context.getApplicationContext();
        this.listener=listener;
    }
    public boolean usesStream(){ return useStream; }
    public void setUseStream(boolean mode) {
        stop();
        useStream=mode;
        report("Режим: "+(useStream?"AudioTrack":"WAV MediaPlayer"));
    }
    private void report(String message) {
        main.post(()->listener.onAudioStatus(message));
    }
    public void stop() {
        generation.incrementAndGet();
        synchronized(lock) {
            if(player!=null){
                try{player.setOnCompletionListener(null);player.setOnErrorListener(null);player.release();}
                catch(RuntimeException ignored){}
                player=null;
            }
            if(track!=null){
                try{track.pause();track.flush();track.release();}
                catch(RuntimeException ignored){}
                track=null;
            }
            if(lastFile!=null){lastFile.delete();lastFile=null;}
        }
    }
    private interface PcmSupplier { byte[] generate(); }
    public void play(final String pattern,int characterWpm) {
        playGenerated(()->pcm(pattern,characterWpm),"символ "+pattern);
    }
    public void playText(final String message,int characterWpm,int effectiveWpm) {
        playGenerated(()->CwAudioSequence.render(message,characterWpm,effectiveWpm),
            "сообщение ("+characterWpm+"/"+effectiveWpm+" WPM)");
    }
    public void playExamText(final String message,final int cpm) {
        playGenerated(()->CwExamAudio.renderAtRate(message,cpm),
          "экзаменационная радиограмма "+SrrExamEngine.normalize(message).length()+" знаков / "+cpm+" зн/мин");
    }
    private void playGenerated(final PcmSupplier supplier,final String description) {
        stop();
        final int token=generation.get();
        final boolean stream=useStream;
        report("Подготовка: "+description+" ("+(stream?"AudioTrack":"WAV")+")");
        new Thread(()->{
            try{
                byte[] pcm=supplier.generate();
                if(token!=generation.get())return;
                if(stream){playStream(pcm,token);return;}
                File sound=File.createTempFile("cw-"+token+"-", ".wav", context.getCacheDir());
                try(FileOutputStream output=new FileOutputStream(sound)){
                    output.write(wav(pcm));
                }
                main.post(()->startPlayer(sound,token));
            }catch(Exception e){
                report("ОШИБКА "+e.getClass().getSimpleName()+": "+e.getMessage());
            }
        },"CW-Tone-Prepare").start();
    }
    private void startPlayer(File file,int token) {
        if(token!=generation.get()){file.delete();return;}
        try {
            MediaPlayer mp=new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            mp.setDataSource(file.getAbsolutePath());
            mp.setOnCompletionListener(p->{
                if(token==generation.get())report("Сигнал завершён (WAV)");
                clearPlayer(p);
            });
            mp.setOnErrorListener((p,what,extra)->{
                report("ОШИБКА MediaPlayer: what="+what+", extra="+extra+"; переключи аудиорежим");
                clearPlayer(p);
                return true;
            });
            synchronized(lock){
                if(token!=generation.get()){mp.release();file.delete();return;}
                player=mp;lastFile=file;
            }
            mp.prepare();  // small local WAV, no network
            if(token!=generation.get())return;
            mp.start();
            report("Воспроизведение WAV запущено");
        } catch(Exception e) {
            report("ОШИБКА WAV: "+e.getClass().getSimpleName()+": "+e.getMessage());
            stop();
            file.delete();
        }
    }
    private void clearPlayer(MediaPlayer completed) {
        synchronized(lock){
            if(player==completed)player=null;
            try{completed.release();}catch(RuntimeException ignored){}
            if(lastFile!=null){lastFile.delete();lastFile=null;}
        }
    }
    private void playStream(byte[] pcm,int token) {
        AudioTrack current=null;
        try {
            int min=AudioTrack.getMinBufferSize(SAMPLE_RATE,AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT);
            if(min<=0)throw new IllegalStateException("AudioTrack buffer="+min);
            current=new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(Math.max(min,8192)).build();
            if(current.getState()!=AudioTrack.STATE_INITIALIZED)
                throw new IllegalStateException("AudioTrack not initialized");
            synchronized(lock){
                if(token!=generation.get()){current.release();return;}
                track=current;current.play();
            }
            report("Воспроизведение AudioTrack запущено");
            int pos=0;
            while(pos<pcm.length && token==generation.get()){
                int n=current.write(pcm,pos,Math.min(8192,pcm.length-pos),
                        AudioTrack.WRITE_BLOCKING);
                if(n<=0)throw new IllegalStateException("AudioTrack write="+n);
                pos+=n;
            }
            if(token==generation.get()) {
                Thread.sleep((pcm.length*1000L/(SAMPLE_RATE*2))+80);
                report("Сигнал завершён (AudioTrack)");
            }
        }catch(Exception e){
            report("ОШИБКА AudioTrack: "+e.getClass().getSimpleName()+": "+e.getMessage());
        }finally{
            synchronized(lock){
                if(track==current)track=null;
                if(current!=null){
                    try{current.stop();}catch(RuntimeException ignored){}
                    try{current.release();}catch(RuntimeException ignored){}
                }
            }
        }
    }
    public static byte[] pcm(String pattern,int wpm) {
        if(pattern==null || !pattern.matches("[.\\-]+"))
            throw new IllegalArgumentException("Invalid morse pattern");
        int dot=Math.round(1200f/Math.max(8,Math.min(35,wpm)));
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        append(out,180,false);
        for(int i=0;i<pattern.length();i++){
            append(out,pattern.charAt(i)=='-'?3*dot:dot,true);
            if(i+1<pattern.length())append(out,dot,false);
        }
        append(out,250,false);
        return out.toByteArray();
    }
    private static void append(ByteArrayOutputStream out,int ms,boolean sound) {
        int samples=SAMPLE_RATE*ms/1000;
        for(int i=0;i<samples;i++) {
            double fade=Math.max(0,Math.min(1,Math.min(i,samples-1-i)/(SAMPLE_RATE*0.005)));
            short s=(short)(sound? 18500*Math.sin(2*Math.PI*FREQUENCY*i/SAMPLE_RATE)*fade:0);
            out.write(s&255);out.write((s>>>8)&255);
        }
    }
    private static void le(ByteArrayOutputStream out,int n,int bytes) {
        for(int k=0;k<bytes;k++)out.write((n>>>(8*k))&255);
    }
    public static byte[] wav(byte[] pcm) {
        ByteArrayOutputStream out=new ByteArrayOutputStream(pcm.length+44);
        for(byte b:"RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII))out.write(b);
        le(out,pcm.length+36,4);
        for(byte b:"WAVEfmt ".getBytes(java.nio.charset.StandardCharsets.US_ASCII))out.write(b);
        le(out,16,4);le(out,1,2);le(out,1,2);
        le(out,SAMPLE_RATE,4);le(out,SAMPLE_RATE*2,4);
        le(out,2,2);le(out,16,2);
        for(byte b:"data".getBytes(java.nio.charset.StandardCharsets.US_ASCII))out.write(b);
        le(out,pcm.length,4);
        out.write(pcm,0,pcm.length);
        return out.toByteArray();
    }
}
