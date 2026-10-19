package com.cwtrainer.pocket;

import java.util.Arrays;

/**
 * Local assessments are app-defined gates, not CW Academy certifications.
 * Guessing/choice exercises are intentionally never graded.
 */
public final class CwCourseState {
    public int unlocked=1;
    public int selected=1;
    public final int[] attempts=new int[16];
    public final int[] correct=new int[16];
    public final int[][] kindAttempts=new int[16][7];
    public final int[][] kindCorrect=new int[16][7];
    public int daysPracticed=0;
    public long lastPracticeDay=0;
    public int recentErrors=0;

    public void recordPractice(long now){
        long day=now/86400000L;
        if(day!=lastPracticeDay){lastPracticeDay=day;daysPracticed++;}
    }
    public void grade(int session,CwCoursePlan.Kind kind,boolean right,long now) {
        if(session<1||session>unlocked)throw new IllegalArgumentException("Locked session");
        if(kind==CwCoursePlan.Kind.SENDING)throw new IllegalArgumentException("Sending not auto certified");
        int i=session-1;
        attempts[i]++;
        kindAttempts[i][kind.ordinal()]++;
        if(right){correct[i]++;kindCorrect[i][kind.ordinal()]++;}
        else recentErrors++;
        recordPractice(now);
        if(passed(session) && unlocked==session && unlocked<16)unlocked++;
    }
    public int accuracy(int session){
        int i=session-1;
        return attempts[i]==0?0:(100*correct[i])/attempts[i];
    }
    public boolean passed(int session) {
        int i=session-1;
        if(attempts[i]<30 || accuracy(session)<90)return false;
        // Evaluates a range of decoding skills, not just isolated characters.
        if(session<=10) {
            if(kindAttempts[i][CwCoursePlan.Kind.CHARACTER.ordinal()]<8)return false;
            if(kindAttempts[i][CwCoursePlan.Kind.GROUP.ordinal()]<8)return false;
            if(kindAttempts[i][CwCoursePlan.Kind.WORD.ordinal()]<6)return false;
            if(session>=2 && kindAttempts[i][CwCoursePlan.Kind.CALLSIGN.ordinal()]<3)return false;
        }else {
            if(kindAttempts[i][CwCoursePlan.Kind.MESSAGE.ordinal()]<8)return false;
            if(kindAttempts[i][CwCoursePlan.Kind.CALLSIGN.ordinal()]<6)return false;
            if(kindAttempts[i][CwCoursePlan.Kind.GROUP.ordinal()]<6)return false;
        }
        return true;
    }
    public String save() {
        StringBuilder b=new StringBuilder();
        b.append("CW4|").append(unlocked).append('|').append(selected)
         .append('|').append(daysPracticed).append('|').append(lastPracticeDay).append('|').append(recentErrors);
        for(int i=0;i<16;i++){
            b.append('|').append(attempts[i]).append(',').append(correct[i]);
            for(int k=0;k<7;k++)b.append(',').append(kindAttempts[i][k]).append(',').append(kindCorrect[i][k]);
        }
        return b.toString();
    }
    public static CwCourseState load(String encoded) {
        CwCourseState state=new CwCourseState();
        if(encoded==null||encoded.isEmpty())return state;
        try{
            String[] e=encoded.split("\\|");
            if(e.length!=22||!e[0].equals("CW4"))return state;
            state.unlocked=Math.min(16,Math.max(1,Integer.parseInt(e[1])));
            state.selected=Math.min(state.unlocked,Math.max(1,Integer.parseInt(e[2])));
            state.daysPracticed=Math.max(0,Integer.parseInt(e[3]));
            state.lastPracticeDay=Long.parseLong(e[4]);
            state.recentErrors=Math.max(0,Integer.parseInt(e[5]));
            for(int i=0;i<16;i++){
                String[] cells=e[6+i].split(",");
                if(cells.length!=16)return new CwCourseState();
                state.attempts[i]=Integer.parseInt(cells[0]);
                state.correct[i]=Integer.parseInt(cells[1]);
                if(state.attempts[i]<0||state.correct[i]<0||state.correct[i]>state.attempts[i])
                    return new CwCourseState();
                for(int k=0;k<7;k++){
                    state.kindAttempts[i][k]=Integer.parseInt(cells[2+k*2]);
                    state.kindCorrect[i][k]=Integer.parseInt(cells[3+k*2]);
                }
            }
            return state;
        }catch(Exception e){return new CwCourseState();}
    }
}
