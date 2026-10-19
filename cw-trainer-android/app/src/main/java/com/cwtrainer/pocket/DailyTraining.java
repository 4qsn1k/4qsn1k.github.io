package com.cwtrainer.pocket;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Independent daily practice plan: short, progressive and error-focused. */
public final class DailyTraining {
    private DailyTraining(){}
    public static final int SINGLE_COUNT=12;
    public static final int PAIRS_COUNT=8;
    public static final int GROUPS_COUNT=6;
    public static final int TOTAL=SINGLE_COUNT+PAIRS_COUNT+GROUPS_COUNT;

    public static final class Task {
        public final int index;
        public final String target;
        public final boolean isolated;
        public final int[] symbols;
        Task(int index,String target,int[] symbols){
            this.index=index;this.target=target;this.symbols=symbols;isolated=symbols.length==1;
        }
    }
    public static final class Assessment {
        public final boolean correct;
        public final int distance;
        public final int[] missedSymbols;
        Assessment(boolean c,int d,int[] missed){correct=c;distance=d;missedSymbols=missed;}
    }
    public static Task task(int index,MorseCourse.Progress progress,List<MorseCourse.Symbol> alphabet,
                            boolean russian,Random rng,long now) {
        if(index<0||index>=TOTAL)throw new IllegalArgumentException("Index 0..25");
        int count=index<SINGLE_COUNT?1:index<SINGLE_COUNT+PAIRS_COUNT?2:5;
        int[] symbols=new int[count];
        StringBuilder text=new StringBuilder(count);
        for(int i=0;i<count;i++){
            int next=progress.choose(rng,now);
            symbols[i]=next;
            text.append(alphabet.get(next).label(russian));
        }
        return new Task(index,text.toString(),symbols);
    }
    public static String normalized(String response) {
        return response==null?"":response.trim().toUpperCase(java.util.Locale.ROOT)
               .replace("Ё","Е").replaceAll("\\s+","");
    }
    /** Levenshtein backtracking to avoid marking every later char wrong after one skipped sign. */
    public static Assessment assess(Task task,String answer) {
        String expected=normalized(task.target),actual=normalized(answer);
        int n=expected.length(),m=actual.length();
        int[][] dp=new int[n+1][m+1];
        for(int i=0;i<=n;i++)dp[i][0]=i;
        for(int j=0;j<=m;j++)dp[0][j]=j;
        for(int i=1;i<=n;i++)for(int j=1;j<=m;j++){
            int diff=expected.charAt(i-1)==actual.charAt(j-1)?0:1;
            dp[i][j]=Math.min(dp[i-1][j-1]+diff,
                Math.min(dp[i-1][j]+1,dp[i][j-1]+1));
        }
        boolean[] misses=new boolean[n];
        int i=n,j=m;
        while(i>0||j>0){
            if(i>0&&j>0){
                int cost=expected.charAt(i-1)==actual.charAt(j-1)?0:1;
                if(dp[i][j]==dp[i-1][j-1]+cost){
                    if(cost>0)misses[i-1]=true;
                    i--;j--;continue;
                }
            }
            if(i>0&&dp[i][j]==dp[i-1][j]+1){
                misses[i-1]=true;i--;continue;
            }
            if(j>0&&dp[i][j]==dp[i][j-1]+1){
                // Insertion is a group error. The most recent symbol absorbs its penalty.
                misses[Math.max(0,i-1)]=true;j--;continue;
            }
            throw new IllegalStateException("No edit path");
        }
        List<Integer> problem=new ArrayList<>();
        for(int k=0;k<n;k++)if(misses[k])problem.add(task.symbols[k]);
        int[] result=new int[problem.size()];
        for(int k=0;k<result.length;k++)result[k]=problem.get(k);
        return new Assessment(dp[n][m]==0,dp[n][m],result);
    }
    public static boolean appliesToMastery(Task task,boolean replayed) {
        return task.isolated && !replayed;
    }
    public static int dueCount(MorseCourse.Progress progress,long now){
        int due=0;
        for(int i=0;i<progress.unlocked;i++)
            if(progress.dueAt[i]!=0 && progress.dueAt[i]<=now)due++;
        return due;
    }
}
