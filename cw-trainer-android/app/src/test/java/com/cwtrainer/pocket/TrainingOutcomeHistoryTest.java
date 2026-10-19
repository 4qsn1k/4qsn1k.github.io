package com.cwtrainer.pocket;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class TrainingOutcomeHistoryTest {
    private static final long DAY=86400000L;
    private TrainingOutcomeHistory.Record cw(long d,int errors,int signs,int cpm) {
        return new TrainingOutcomeHistory.Record(TrainingOutcomeHistory.Part.MORSE,
            (20000+d)*DAY,signs-errors,signs,cpm,signs*60000L/cpm);
    }
    private TrainingOutcomeHistory.Record theory(long d,int correct) {
        return new TrainingOutcomeHistory.Record(TrainingOutcomeHistory.Part.THEORY,
            (20000+d)*DAY,correct,45,0,45*60*1000L);
    }
    @Test public void noReadinessAfterOneLuckyDayOrShortDrills() {
        String history="";
        for(int i=0;i<3;i++)history=TrainingOutcomeHistory.append(history,cw(0,0,25,30));
        history=TrainingOutcomeHistory.append(history,cw(0,0,250,60));
        history=TrainingOutcomeHistory.append(history,theory(0,45));
        List<TrainingOutcomeHistory.Record> logs=TrainingOutcomeHistory.parse(history);
        assertEquals(1,TrainingOutcomeHistory.strictPasses(logs,TrainingOutcomeHistory.Part.MORSE));
        assertFalse(TrainingOutcomeHistory.sustainedReadiness(logs));
    }
    @Test public void sustainedEvidenceRequiresThreeSeparateCwPassesAndTheoryAcrossDays() {
        String state="";
        for(int i=0;i<3;i++)state=TrainingOutcomeHistory.append(state,cw(i,2,250,60));
        for(int i=0;i<2;i++)state=TrainingOutcomeHistory.append(state,theory(i,42));
        assertTrue(TrainingOutcomeHistory.sustainedReadiness(TrainingOutcomeHistory.parse(state)));
        state=TrainingOutcomeHistory.append(state,cw(4,4,250,60));
        assertEquals(3,TrainingOutcomeHistory.strictPasses(TrainingOutcomeHistory.parse(state),
            TrainingOutcomeHistory.Part.MORSE));
        assertEquals(2,TrainingOutcomeHistory.bestStrictMorseErrors(TrainingOutcomeHistory.parse(state)));
    }
    @Test public void distinctCalendarDaysMatterForLearningPath() {
        String state="";
        state=TrainingOutcomeHistory.append(state,cw(0,0,25,30));
        state=TrainingOutcomeHistory.append(state,cw(0,0,25,30));
        List<TrainingOutcomeHistory.Record> records=TrainingOutcomeHistory.parse(state);
        assertEquals(1,AdaptiveReceptionPlan.successfulDifferentDays(records,AdaptiveReceptionPlan.step(0)));
        assertEquals(25,AdaptiveReceptionPlan.recommended(records).signs);
        state=TrainingOutcomeHistory.append(state,cw(1,0,25,30));
        records=TrainingOutcomeHistory.parse(state);
        assertEquals(40,AdaptiveReceptionPlan.recommended(records).cpm);
        assertEquals(25,AdaptiveReceptionPlan.recommended(records).signs);
    }
    @Test public void fullSpeedProgressionOnlyAfterAllEarlierSteps() {
        String state="";
        for(int i=0;i<AdaptiveReceptionPlan.steps()-1;i++){
            AdaptiveReceptionPlan.Step step=AdaptiveReceptionPlan.step(i);
            state=TrainingOutcomeHistory.append(state,cw(i*2,step.maxErrors,step.signs,step.cpm));
            state=TrainingOutcomeHistory.append(state,cw(i*2+1,step.maxErrors,step.signs,step.cpm));
        }
        AdaptiveReceptionPlan.Step recommendation=AdaptiveReceptionPlan.recommended(
            TrainingOutcomeHistory.parse(state));
        assertEquals(250,recommendation.signs);
        assertEquals(60,recommendation.cpm);
        assertFalse(TrainingOutcomeHistory.sustainedReadiness(TrainingOutcomeHistory.parse(state)));
    }
    @Test public void higherProficiencyEvidenceSupersedesUnloggedEasyStages(){
        String log="";
        log=TrainingOutcomeHistory.append(log,cw(0,2,250,60));
        log=TrainingOutcomeHistory.append(log,cw(1,3,250,60));
        AdaptiveReceptionPlan.Step recommended=AdaptiveReceptionPlan.recommended(
            TrainingOutcomeHistory.parse(log));
        assertEquals(250,recommended.signs);
        assertEquals(60,recommended.cpm);
    }
    @Test public void malformedDataIgnoredAndOldestRecordsTrimmed() {
        assertTrue(TrainingOutcomeHistory.parse("broken").isEmpty());
        String x="CW-OUTCOMES-1|broken|M,foo,4,250,60,250000";
        assertTrue(TrainingOutcomeHistory.parse(x).isEmpty());
        String state="";
        for(int i=0;i<130;i++)state=TrainingOutcomeHistory.append(state,cw(i,1,250,60));
        assertEquals(120,TrainingOutcomeHistory.parse(state).size());
    }
}
