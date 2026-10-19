package com.cwtrainer.pocket;

import java.util.HashSet;
import java.util.List;

/**
 * Prerequisite-based path toward the Russian first-category random-group reception test.
 * Numeric advancement gates are engineering defaults, not independently validated pedagogy.
 */
public final class AdaptiveReceptionPlan {
    private AdaptiveReceptionPlan(){}
    public static final class Step {
        public final int signs, cpm, maxErrors;
        Step(int signs,int cpm,int maxErrors){
            this.signs=signs;this.cpm=cpm;this.maxErrors=maxErrors;
        }
        public String label(){
            return signs+" новых знаков, "+cpm+" зн/мин, до "+maxErrors+" ошибок";
        }
    }
    private static final Step[] STEPS={
        new Step(25,30,0), new Step(25,40,0),new Step(25,50,0),
        new Step(50,50,1),new Step(50,60,1),new Step(100,60,2),
        new Step(250,60,3)
    };
    public static Step step(int n){
        if(n<0||n>=STEPS.length)throw new IllegalArgumentException("Step "+n);
        return STEPS[n];
    }
    public static int steps(){return STEPS.length;}
    public static boolean passedAtStep(TrainingOutcomeHistory.Record outcome,Step step){
        return outcome.part==TrainingOutcomeHistory.Part.MORSE
            && outcome.total==step.signs && outcome.rate==step.cpm
            && outcome.mistakes()<=step.maxErrors
            && outcome.elapsedMs>=Math.max(1,60000L*step.signs/step.cpm-10000)
            && outcome.elapsedMs<=60000L*step.signs/step.cpm+20000;
    }
    public static int successfulDifferentDays(List<TrainingOutcomeHistory.Record> records,Step step){
        HashSet<Long> days=new HashSet<>();
        for(TrainingOutcomeHistory.Record item:records)
            if(passedAtStep(item,step))days.add(item.timestamp/86400000L);
        return days.size();
    }
    public static Step recommended(List<TrainingOutcomeHistory.Record> records){
        // Proof at a HARDER level supersedes earlier easier stages.
        // A user who can already copy 250 signs must not be sent back to 25/30
        // merely because the earlier stages were not logged by older APKs.
        for(int i=STEPS.length-1;i>=0;i--)
            if(successfulDifferentDays(records,STEPS[i])>=2)
                return STEPS[Math.min(i+1,STEPS.length-1)];
        return STEPS[0];
    }
    public static String explanation(List<TrainingOutcomeHistory.Record> records){
        Step step=recommended(records);
        int days=successfulDifferentDays(records,step);
        return "Следующая цель: "+step.label()+"\n"+
            "Успешных дней на этой ступени: "+days+"/2. "+
            "Для перехода нужны новые последовательности, успешно принятые в разные дни.";
    }
}
