package com.cwtrainer.pocket;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/** Offline course data and assessment rules. No Android dependencies. */
public final class MorseCourse {
    private MorseCourse() {}
    public static final class Symbol {
        public final String code, en, ru;
        Symbol(String code, String en, String ru) {
            this.code=code; this.en=en; this.ru=ru;
        }
        public String label(boolean russian) { return russian ? ru : en; }
    }
    // The international beginner sequence starts with A E N T, following
    // CW Academy's first lesson. Subsequent ordering is our adaptation.
    private static final Symbol[] DATA = {
        new Symbol(".-","A","А"), new Symbol(".","E","Е"),
        new Symbol("-.","N","Н"), new Symbol("-","T","Т"),
        new Symbol("..","I","И"), new Symbol("...","S","С"),
        new Symbol("---","O","О"), new Symbol(".-.","R","Р"),
        new Symbol("....","H","Х"), new Symbol("-..","D","Д"),
        new Symbol(".-..","L","Л"), new Symbol("..-","U","У"),
        new Symbol("-.-.","C","Ц"), new Symbol("--","M","М"),
        new Symbol(".--.","P","П"), new Symbol(".--","W","В"),
        new Symbol("..-.","F","Ф"), new Symbol("-...","B","Б"),
        new Symbol("--.","G","Г"), new Symbol("-.--","Y","Ы"),
        new Symbol("...-","V","Ж"), new Symbol("-.-","K","К"),
        new Symbol("--.-","Q","Щ"), new Symbol("-..-","X","Ь"),
        new Symbol(".---","J","Й"), new Symbol("--..","Z","З"),
        new Symbol("----","","Ш"), new Symbol("---.","","Ч"),
        new Symbol("--.--","","Ъ"), new Symbol("..-..","","Э"),
        new Symbol("..--","","Ю"), new Symbol(".-.-","","Я"),
        new Symbol("-----","0","0"), new Symbol(".----","1","1"),
        new Symbol("..---","2","2"), new Symbol("...--","3","3"),
        new Symbol("....-","4","4"), new Symbol(".....","5","5"),
        new Symbol("-....","6","6"), new Symbol("--...","7","7"),
        new Symbol("---..","8","8"), new Symbol("----.","9","9")
    };
    public static List<Symbol> alphabet(boolean russian) {
        ArrayList<Symbol> result=new ArrayList<>();
        for(Symbol symbol:DATA) if(!symbol.label(russian).isEmpty())result.add(symbol);
        return Collections.unmodifiableList(result);
    }
    public static final class Progress {
        public int unlocked=4;
        public int attempts=0;
        public int cleanCorrect=0;
        public final int[] seen=new int[64];
        public final int[] cleanBySymbol=new int[64];
        public final int[] misses=new int[64];
        public final int[] retentionLevel=new int[64];
        public final long[] dueAt=new long[64];
        // Counts are reset at every lesson graduation; retention levels persist.
        public boolean record(int index, boolean correct, boolean replayed, int symbolCount, long now) {
            if(index<0 || index>=unlocked || index>=seen.length) throw new IllegalArgumentException("Index not unlocked");
            attempts++;
            seen[index]++;
            boolean clean=correct && !replayed;
            if(clean) {
                cleanCorrect++;
                cleanBySymbol[index]++;
                misses[index]=Math.max(0,misses[index]-1);
                retentionLevel[index]=Math.min(3,retentionLevel[index]+1);
                long days=retentionLevel[index]==1 ? 1 : retentionLevel[index]==2 ? 3 : 7;
                dueAt[index]=now+days*86400000L;
            } else {
                misses[index]=Math.min(50,misses[index]+2);
                retentionLevel[index]=0;
                dueAt[index]=now;
            }
            if(attempts>=40 && cleanCorrect*100>=90*attempts) {
                boolean ready=true;
                // Every new symbol must appear repeatedly in an unaided test.
                int from=Math.max(0,unlocked==4?0:unlocked-1);
                for(int i=from;i<unlocked;i++)
                    if(seen[i]<8 || cleanBySymbol[i]*100<80*seen[i])ready=false;
                if(ready && unlocked<symbolCount) {
                    unlocked++;
                    clearLessonCounters();
                    return true;
                }
            }
            return false;
        }
        private void clearLessonCounters() {
            attempts=0;cleanCorrect=0;
            java.util.Arrays.fill(seen,0);
            java.util.Arrays.fill(cleanBySymbol,0);
        }
        public int choose(Random random, long now) {
            // Ensure representative coverage, prioritise errors and due reviews.
            int total=0;
            int[] weights=new int[unlocked];
            for(int i=0;i<unlocked;i++){
                int weight=2+Math.min(8,misses[i]);
                if(i>=Math.max(0,unlocked==4?0:unlocked-1))weight+=3;
                if(seen[i]<8)weight+=5;
                if(dueAt[i]!=0 && dueAt[i]<=now)weight+=4;
                weights[i]=weight;total+=weight;
            }
            int selected=random.nextInt(total);
            for(int i=0;i<unlocked;i++){selected-=weights[i];if(selected<0)return i;}
            return unlocked-1;
        }
        public int accuracy() {return attempts==0?0:(100*cleanCorrect/attempts);}
        // Local persistence format; any malformed record is ignored by caller.
        public String serialize() {
            StringBuilder b=new StringBuilder();
            b.append(unlocked).append('|').append(attempts).append('|').append(cleanCorrect);
            for(int i=0;i<64;i++)b.append('|').append(seen[i]).append(',').append(cleanBySymbol[i])
                .append(',').append(misses[i]).append(',').append(retentionLevel[i]).append(',').append(dueAt[i]);
            return b.toString();
        }
        public static Progress parse(String s, int count) {
            Progress p=new Progress();
            if(s==null || s.isEmpty())return p;
            try {
                String[] parts=s.split("\\|",-1);
                if(parts.length!=67)return p;
                int countUnlocked=Integer.parseInt(parts[0]);
                p.unlocked=Math.min(count,Math.max(4,countUnlocked));
                p.attempts=Integer.parseInt(parts[1]);
                p.cleanCorrect=Integer.parseInt(parts[2]);
                if(p.attempts<0 || p.cleanCorrect<0 || p.cleanCorrect>p.attempts) return new Progress();
                for(int i=0;i<64;i++){
                    String[] e=parts[i+3].split(",");
                    if(e.length!=5)return new Progress();
                    p.seen[i]=Integer.parseInt(e[0]);p.cleanBySymbol[i]=Integer.parseInt(e[1]);
                    p.misses[i]=Integer.parseInt(e[2]);p.retentionLevel[i]=Integer.parseInt(e[3]);
                    p.dueAt[i]=Long.parseLong(e[4]);
                }
                return p;
            }catch(RuntimeException ignored){return new Progress();}
        }
    }
}
