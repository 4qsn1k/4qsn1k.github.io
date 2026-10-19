package com.cwtrainer.pocket;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Evidence-oriented log of completed first-category practice exams.
 *
 * The minimums below are internal readiness signals, NOT SRR certification.
 * Training items or abandoned attempts are not recorded as examination passes.
 */
public final class TrainingOutcomeHistory {
    private TrainingOutcomeHistory(){}
    private static final int LIMIT=120;
    private static final String HEADER="CW-OUTCOMES-1";
    public enum Part { MORSE, THEORY }
    public static final class Record {
        public final Part part;
        public final long timestamp;
        public final int correct, total, rate;
        public final long elapsedMs;
        public Record(Part part,long timestamp,int correct,int total,int rate,long elapsedMs) {
            if(part==null||timestamp<=0||correct<0||total<=0||correct>total||rate<0||elapsedMs<=0)
                throw new IllegalArgumentException("Invalid training outcome");
            this.part=part;this.timestamp=timestamp;this.correct=correct;
            this.total=total;this.rate=rate;this.elapsedMs=elapsedMs;
        }
        public int mistakes(){return total-correct;}
        public boolean isStrictPass(){
            if(part==Part.MORSE)
                return total==250 && rate==60 && mistakes()<=3
                    && elapsedMs>=240000 && elapsedMs<=270000;
            return total==45 && correct>=40 && elapsedMs<=90L*60*1000;
        }
    }
    public static String append(String serialized,Record record) {
        ArrayList<Record> items=new ArrayList<>(parse(serialized));
        items.add(record);
        if(items.size()>LIMIT)items.subList(0,items.size()-LIMIT).clear();
        return encode(items);
    }
    public static String encode(List<Record> items) {
        StringBuilder b=new StringBuilder(HEADER);
        for(Record r:items) {
            b.append('|').append(r.part==Part.MORSE?'M':'T').append(',')
             .append(r.timestamp).append(',').append(r.correct).append(',')
             .append(r.total).append(',').append(r.rate).append(',')
             .append(r.elapsedMs);
        }
        return b.toString();
    }
    public static List<Record> parse(String raw){
        ArrayList<Record> entries=new ArrayList<>();
        if(raw==null||!raw.startsWith(HEADER))return Collections.unmodifiableList(entries);
        String[] parts=raw.split("\\|",-1);
        if(parts.length>500)return Collections.unmodifiableList(entries);
        if(!parts[0].equals(HEADER))return Collections.unmodifiableList(entries);
        for(int i=1;i<parts.length;i++){
            String[] f=parts[i].split(",");
            if(f.length!=6)continue;
            try{
                Part part=f[0].equals("M")?Part.MORSE:
                          f[0].equals("T")?Part.THEORY:null;
                if(part==null)continue;
                Record r=new Record(part,Long.parseLong(f[1]),Integer.parseInt(f[2]),
                    Integer.parseInt(f[3]),Integer.parseInt(f[4]),Long.parseLong(f[5]));
                if(r.part==Part.MORSE&&(r.rate<20||r.rate>150||r.total>250))continue;
                if(r.part==Part.THEORY && r.total!=45)continue;
                entries.add(r);
            }catch(RuntimeException ignored){}
        }
        if(entries.size()>LIMIT)entries.subList(0,entries.size()-LIMIT).clear();
        return Collections.unmodifiableList(entries);
    }
    private static long day(Record r){return r.timestamp/86400000L;}
    public static int strictPasses(List<Record> items,Part part){
        int count=0;for(Record r:items)if(r.part==part && r.isStrictPass())count++;return count;
    }
    public static int distinctPassDays(List<Record> items,Part part){
        java.util.HashSet<Long> dates=new java.util.HashSet<>();
        for(Record r:items)if(r.part==part&&r.isStrictPass())dates.add(day(r));
        return dates.size();
    }
    /** Project-defined consistency evidence, deliberately more than one lucky pass. */
    public static boolean sustainedReadiness(List<Record> items){
        return strictPasses(items,Part.MORSE)>=3
            && distinctPassDays(items,Part.MORSE)>=2
            && strictPasses(items,Part.THEORY)>=2
            && distinctPassDays(items,Part.THEORY)>=2;
    }
    public static int bestStrictMorseErrors(List<Record> items){
        int best=Integer.MAX_VALUE;
        for(Record r:items)if(r.part==Part.MORSE&&r.total==250&&r.rate==60)
            best=Math.min(best,r.mistakes());
        return best==Integer.MAX_VALUE?-1:best;
    }
    public static String recentSummary(List<Record> items,int max){
        if(max<1)throw new IllegalArgumentException("max");
        StringBuilder b=new StringBuilder();
        int shown=0;
        for(int i=items.size()-1;i>=0&&shown<max;i--){
            Record r=items.get(i);
            b.append(r.part==Part.MORSE?"CW ":"Теория ");
            b.append(r.part==Part.MORSE?(r.mistakes()+" ошибок, "+r.rate+" зн/мин"):
                     (r.correct+"/"+r.total+" правильных"));
            b.append(r.isStrictPass()?" ✓":" ✕");
            b.append("\n");shown++;
        }
        return b.length()==0?"Нет завершённых пробных экзаменов":b.toString().trim();
    }
}
