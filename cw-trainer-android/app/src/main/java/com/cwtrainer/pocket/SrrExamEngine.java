package com.cwtrainer.pocket;

import java.util.Random;

/** Pure assessment logic for practice of the Russian first-category CW norm. */
public final class SrrExamEngine {
    public static final int RADIOGRAM_LENGTH=250;
    public static final int RATE_CPM=60;
    public static final int MAX_CW_ERRORS=3;
    public static final int THEORY_QUESTIONS=45;
    public static final int MIN_THEORY_CORRECT=40;
    public static final long THEORY_LIMIT_MS=90L*60*1000;
    public static final long CW_SESSION_LIMIT_MS=15L*60*1000;
    private static final String LETTERS="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final String NUMBERS="0123456789";
    private SrrExamEngine(){}

    /** Exactly 250 audible signs arranged in 50 five-sign groups. */
    public static String randomRadiogram(Random rng) {
        return randomRadiogram(rng,RADIOGRAM_LENGTH);
    }
    public static String randomRadiogram(Random rng,int count) {
        if(count<5 || count>250 || count%5!=0)throw new IllegalArgumentException("Count must be 5..250 in groups of five");
        StringBuilder out=new StringBuilder(count+count/5);
        for(int i=0;i<count;i++){
            if(i!=0 && i%5==0)out.append(' ');
            // Mostly letters with an occasional digit; no memorized text or fixed pattern.
            String bag=rng.nextInt(100)<7?NUMBERS:LETTERS;
            out.append(bag.charAt(rng.nextInt(bag.length())));
        }
        return out.toString();
    }
    public static String normalize(String text) {
        if(text==null)return "";
        return text.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]","");
    }
    /** Substitution, insertion and deletion each count as one. */
    public static int errors(String reference,String answer) {
        if(normalize(reference).length()!=RADIOGRAM_LENGTH)throw new IllegalArgumentException("Expected 250 symbols");
        return errorsAny(reference,answer);
    }
    public static int errorsAny(String reference,String answer) {
        String a=normalize(reference),b=normalize(answer);
        if(a.isEmpty() || a.length()>250)throw new IllegalArgumentException("Invalid reference");
        int[] previous=new int[b.length()+1],current=new int[b.length()+1];
        for(int j=0;j<=b.length();j++)previous[j]=j;
        for(int i=1;i<=a.length();i++){
            current[0]=i;
            for(int j=1;j<=b.length();j++){
                int cost=a.charAt(i-1)==b.charAt(j-1)?0:1;
                current[j]=Math.min(previous[j-1]+cost,Math.min(previous[j]+1,current[j-1]+1));
            }
            int[] swap=previous;previous=current;current=swap;
        }
        return previous[b.length()];
    }
    public static boolean morsePassed(int errors,long totalDurationMs) {
        return errors<=MAX_CW_ERRORS && totalDurationMs<=CW_SESSION_LIMIT_MS;
    }
    public static boolean theoryPassed(int correct,int total,long elapsedMs) {
        return total==THEORY_QUESTIONS && correct>=MIN_THEORY_CORRECT &&
               elapsedMs<=THEORY_LIMIT_MS;
    }
}
