package com.cwtrainer.pocket;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** Continuous, 250-second, 250-sign reception signal for first-category practice. */
public final class CwExamAudio {
    private CwExamAudio(){}
    public static final int SAMPLE_RATE=44100;
    public static final int FREQUENCY=650;
    public static final int DURATION_SECONDS=250;
    private static final int LEAD_SAMPLES=SAMPLE_RATE/10;
    private static final int FINAL_SAMPLES=SAMPLE_RATE/10;
    private static final short[] WAVE=new short[882];
    static{
        for(int i=0;i<WAVE.length;i++)
            WAVE[i]=(short)Math.round(Math.sin(2*Math.PI*13*i/882.0)*19000);
    }
    public static int totalUnits(String message) {
        int count=SrrExamEngine.normalize(message).length();
        if(count<5||count>250||count%5!=0)
            throw new IllegalArgumentException("Must have 5..250 signs in groups of five");
        List<String> tokens=CwCoursePlan.tokenize(message);
        int units=0;boolean first=true,wordGap=false;
        for(String token:tokens){
            if(token.equals(" ")){if(!first)wordGap=true;continue;}
            String code=CwCoursePlan.code(token);
            if(code==null)throw new IllegalArgumentException("Unknown code: "+token);
            if(!first)units+=wordGap?7:3;
            wordGap=false;
            for(int i=0;i<code.length();i++){
                if(i>0)units++;
                units+=code.charAt(i)=='-'?3:1;
            }
            first=false;
        }
        return units;
    }
    public static int samplesPerDot(String message){
        return samplesPerDot(message,60);
    }
    public static int samplesPerDot(String message,int cpm){
        if(cpm<30||cpm>80)throw new IllegalArgumentException("Rate 30..80 cpm");
        int units=totalUnits(message);
        int available=(int)(SAMPLE_RATE*durationMillis(message,cpm)/1000)-LEAD_SAMPLES-FINAL_SAMPLES;
        return available/units;
    }
    public static long durationMillis(String message) {
        return durationMillis(message,60);
    }
    public static long durationMillis(String message,int cpm) {
        if(cpm<30||cpm>80)throw new IllegalArgumentException("Rate 30..80 cpm");
        totalUnits(message);
        return Math.round((double)SrrExamEngine.normalize(message).length()*60000.0/cpm);
    }
    /** 16-bit signed PCM LE, exact output length, no pause and no replay. */
    public static byte[] render(String radiogram) {
        if(SrrExamEngine.normalize(radiogram).length()!=250)
            throw new IllegalArgumentException("Exam requires exactly 250 signs");
        return renderAtRate(radiogram,60);
    }
    public static byte[] renderAtRate(String radiogram,int cpm) {
        String text=radiogram.toUpperCase(java.util.Locale.ROOT);
        int dot=samplesPerDot(text,cpm);
        final int targetSamples=(int)(SAMPLE_RATE*durationMillis(text,cpm)/1000);
        ByteArrayOutputStream out=new ByteArrayOutputStream(targetSamples*2);
        append(out,LEAD_SAMPLES,false);
        List<String> tokens=CwCoursePlan.tokenize(text);
        boolean first=true,wordGap=false;
        for(String token:tokens){
            if(token.equals(" ")){if(!first)wordGap=true;continue;}
            if(!first)append(out,dot*(wordGap?7:3),false);
            wordGap=false;
            String code=CwCoursePlan.code(token);
            for(int i=0;i<code.length();i++){
                if(i>0)append(out,dot,false);
                append(out,dot*(code.charAt(i)=='-'?3:1),true);
            }
            first=false;
        }
        int already=out.size()/2;
        if(already>targetSamples)throw new IllegalStateException("Signal too long");
        append(out,targetSamples-already,false);
        byte[] output=out.toByteArray();
        if(output.length!=targetSamples*2)throw new IllegalStateException("Bad PCM duration");
        return output;
    }
    private static void append(ByteArrayOutputStream out,int samples,boolean sound) {
        final int ramp=Math.min(220,samples/3);
        for(int i=0;i<samples;i++){
            int volume=256;
            if(sound && ramp>0){
                volume=Math.min(256,Math.min(i,samples-1-i)*256/ramp);
            }
            short v=(short)(sound?WAVE[i%WAVE.length]*volume/256:0);
            out.write(v&255);
            out.write((v>>>8)&255);
        }
    }
}
