package com.cwtrainer.pocket;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Farnsworth timing using the PARIS reference word.
 * A PARIS cycle has 31 marks/intra-character units and
 * 19 character/word gap units.
 * See ARRL "A Standard for Morse Timing Using the Farnsworth Technique".
 */
public final class CwAudioSequence {
    private CwAudioSequence(){}
    public static final int RATE=44100;
    public static final int HZ=650;
    public static final class Timing {
        public final double ditMs,gapMs;
        Timing(double d,double g){ditMs=d;gapMs=g;}
    }
    public static Timing timing(int characterWpm,int effectiveWpm) {
        if(characterWpm<8 || characterWpm>40)
            throw new IllegalArgumentException("Character WPM 8..40");
        if(effectiveWpm<4 || effectiveWpm>characterWpm)
            throw new IllegalArgumentException("Effective WPM 4..characterWpm");
        double dot=1200.0/characterWpm;
        double farnsworth=(60000.0/effectiveWpm-31*dot)/19;
        // With no Farnsworth expansion, normal spacing is used.
        return new Timing(dot,Math.max(dot,farnsworth));
    }
    public static byte[] render(String message,int characterWpm,int effectiveWpm) {
        if(message==null || message.trim().isEmpty())throw new IllegalArgumentException("Empty message");
        Timing t=timing(characterWpm,effectiveWpm);
        List<String> tokens=CwCoursePlan.tokenize(message.trim().toUpperCase(java.util.Locale.ROOT));
        ByteArrayOutputStream result=new ByteArrayOutputStream();
        append(result,200,false);
        boolean any=false,wordGap=false;
        for(String token:tokens){
            if(token.equals(" ")) {
                if(any)wordGap=true;
                continue;
            }
            if(any)append(result,(int)Math.round(t.gapMs*(wordGap?7:3)),false);
            wordGap=false;
            String code=CwCoursePlan.code(token);
            if(code==null)throw new IllegalArgumentException("Unsupported: "+token);
            for(int i=0;i<code.length();i++){
                char symbol=code.charAt(i);
                append(result,(int)Math.round(t.ditMs*(symbol=='-'?3:1)),true);
                if(i<code.length()-1)append(result,(int)Math.round(t.ditMs),false);
            }
            any=true;
        }
        append(result,250,false);
        return result.toByteArray();
    }
    private static void append(ByteArrayOutputStream out,int millis,boolean sounding){
        int total=(int)((long)RATE*millis/1000);
        for(int i=0;i<total;i++){
            double env=Math.max(0,Math.min(1,Math.min(i,total-1-i)/(RATE*0.005)));
            short s=(short)(sounding ? Math.sin(2*Math.PI*HZ*i/RATE)*19000*env:0);
            out.write(s&255);out.write((s>>>8)&255);
        }
    }
}
