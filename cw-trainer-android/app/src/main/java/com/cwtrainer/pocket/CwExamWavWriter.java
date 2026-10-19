package com.cwtrainer.pocket;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;

/** Long exam signals are streamed directly to WAV, avoiding large Android heap arrays. */
public final class CwExamWavWriter {
    private CwExamWavWriter(){}
    private static final int RATE=CwExamAudio.SAMPLE_RATE;
    private static final short[] WAVE=new short[882];
    static {
        for(int i=0;i<WAVE.length;i++)
            WAVE[i]=(short)Math.round(Math.sin(2*Math.PI*13*i/882.0)*19000);
    }
    private static final class Sink implements AutoCloseable {
        private final BufferedOutputStream out;
        private final byte[] buffer=new byte[16384];
        private int index=0;
        private int samples=0;
        Sink(File file)throws IOException{out=new BufferedOutputStream(new FileOutputStream(file),32768);}
        void byteValue(int value)throws IOException {
            buffer[index++]=(byte)value;
            if(index==buffer.length)flush();
        }
        void flush()throws IOException {
            if(index>0){out.write(buffer,0,index);index=0;}
        }
        void ascii(String value)throws IOException {
            for(int i=0;i<value.length();i++)byteValue(value.charAt(i));
        }
        void little(int value,int width)throws IOException{
            for(int j=0;j<width;j++)byteValue((value>>>(j*8))&255);
        }
        void writeSamples(int count,boolean sound)throws IOException{
            int ramp=Math.min(220,count/3);
            for(int i=0;i<count;i++){
                int volume=256;
                if(sound && ramp>0)volume=Math.min(256,Math.min(i,count-i-1)*256/ramp);
                short s=(short)(sound?WAVE[i%WAVE.length]*volume/256:0);
                byteValue(s&255);byteValue((s>>>8)&255);samples++;
            }
        }
        @Override public void close()throws IOException{
            try{flush();}finally{out.close();}
        }
    }
    public static void write(File output,String radiogram,int cpm)throws IOException {
        String text=radiogram.toUpperCase(java.util.Locale.ROOT);
        final int signs=SrrExamEngine.normalize(text).length();
        if(signs<5||signs>250||signs%5!=0)throw new IllegalArgumentException("Invalid sign count");
        int dot=CwExamAudio.samplesPerDot(text,cpm);
        long samplesLong=(long)RATE*CwExamAudio.durationMillis(text,cpm)/1000;
        if(samplesLong>Integer.MAX_VALUE/2)throw new IllegalArgumentException("Too long");
        int target=(int)samplesLong,bytes=target*2;
        try(Sink sink=new Sink(output)){
            sink.ascii("RIFF");sink.little(bytes+36,4);
            sink.ascii("WAVEfmt ");sink.little(16,4);
            sink.little(1,2);sink.little(1,2);
            sink.little(RATE,4);sink.little(RATE*2,4);
            sink.little(2,2);sink.little(16,2);
            sink.ascii("data");sink.little(bytes,4);
            sink.writeSamples(RATE/10,false);
            List<String> tokens=CwCoursePlan.tokenize(text);
            boolean first=true,wordGap=false;
            for(String token:tokens){
                if(token.equals(" ")){if(!first)wordGap=true;continue;}
                if(!first)sink.writeSamples(dot*(wordGap?7:3),false);
                wordGap=false;
                String code=CwCoursePlan.code(token);
                for(int i=0;i<code.length();i++){
                    if(i>0)sink.writeSamples(dot,false);
                    sink.writeSamples(dot*(code.charAt(i)=='-'?3:1),true);
                }
                first=false;
            }
            if(sink.samples>target)throw new IllegalStateException("Waveform too long");
            sink.writeSamples(target-sink.samples,false);
        }catch(IOException | RuntimeException error){
            output.delete();
            throw error;
        }
        if(output.length()!=bytes+44L)throw new IOException("Incorrect generated file size");
    }
}
