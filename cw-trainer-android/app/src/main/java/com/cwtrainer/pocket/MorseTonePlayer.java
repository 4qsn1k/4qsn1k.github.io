package com.cwtrainer.pocket;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.atomic.AtomicInteger;

/** Native audio. Produces one tone at a time; no WebView or network. */
public final class MorseTonePlayer {
    private final AtomicInteger generation=new AtomicInteger(0);
    private final Object lock=new Object();
    private AudioTrack active=null;
    private static final int SR=22050;
    public void stop(){
        generation.incrementAndGet();
        synchronized(lock) {
            if(active!=null){
                try{active.pause();active.flush();}catch(RuntimeException ignored){}
                try{active.release();}catch(RuntimeException ignored){}
                active=null;
            }
        }
    }
    public void play(final String code,final int characterWpm) {
        stop();
        final int token=generation.get();
        new Thread(()->{
            AudioTrack track=null;
            try{
                final int dot=Math.round(1200f/Math.max(8,Math.min(35,characterWpm)));
                ByteArrayOutputStream pcm=new ByteArrayOutputStream();
                for(int i=0;i<code.length();i++){
                    append(pcm,code.charAt(i)=='-'?3*dot:dot,true);
                    if(i+1<code.length())append(pcm,dot,false);
                }
                append(pcm,100,false);
                byte[] audio=pcm.toByteArray();
                if(token!=generation.get())return;
                track=new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setAudioFormat(new AudioFormat.Builder().setSampleRate(SR)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(audio.length).build();
                if(track.getState()!=AudioTrack.STATE_INITIALIZED)return;
                track.write(audio,0,audio.length);
                synchronized(lock){
                    if(token!=generation.get())return;
                    active=track;
                    track.play();
                }
                Thread.sleep(audio.length*1000L/(SR*2)+120);
            }catch(Exception ignored) {
                // Playback failure must not crash a lesson; phone controls audio output.
            }finally{
                synchronized(lock){
                    if(active==track)active=null;
                    if(track!=null){
                        try{track.stop();}catch(RuntimeException ignored){}
                        try{track.release();}catch(RuntimeException ignored){}
                    }
                }
            }
        },"CW-MorseTone").start();
    }
    private static void append(ByteArrayOutputStream out,int millis,boolean sound){
        int samples=SR*millis/1000;
        for(int i=0;i<samples;i++) {
            double envelope=Math.max(0,Math.min(1,Math.min(i,samples-1-i)/(SR*0.004)));
            short sample=(short)(sound ? 10000*Math.sin(2*Math.PI*650*i/SR)*envelope : 0);
            out.write(sample&0xff);
            out.write((sample>>8)&0xff);
        }
    }
}
