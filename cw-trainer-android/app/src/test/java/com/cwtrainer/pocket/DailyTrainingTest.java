package com.cwtrainer.pocket;

import org.junit.Test;
import java.util.List;
import java.util.Random;
import static org.junit.Assert.*;

public class DailyTrainingTest {
    private final List<MorseCourse.Symbol> alphabet=MorseCourse.alphabet(true);
    @Test public void dailyHasIsolatedPairsAndFiveSignGroups() {
        MorseCourse.Progress state=new MorseCourse.Progress();
        for(int i=0;i<DailyTraining.TOTAL;i++) {
            DailyTraining.Task task=DailyTraining.task(i,state,alphabet,true,new Random(i),100000000L);
            int length=i<DailyTraining.SINGLE_COUNT?1:
                i<DailyTraining.SINGLE_COUNT+DailyTraining.PAIRS_COUNT?2:5;
            assertEquals(length,task.target.length());
            assertEquals(length,task.symbols.length);
            assertEquals(i<DailyTraining.SINGLE_COUNT,task.isolated);
            assertTrue(task.target.matches("[А-Я0-9]{1,5}"));
        }
    }
    @Test public void correctAnswerAndOmittedCharacterAreAssessedLocally(){
        MorseCourse.Progress state=new MorseCourse.Progress();
        DailyTraining.Task task=DailyTraining.task(24,state,alphabet,true,new Random(4),100000L);
        DailyTraining.Assessment good=DailyTraining.assess(task,task.target);
        assertTrue(good.correct);assertEquals(0,good.distance);
        assertEquals(0,good.missedSymbols.length);
        String shortened=task.target.substring(0,2)+task.target.substring(3);
        DailyTraining.Assessment missed=DailyTraining.assess(task,shortened);
        assertFalse(missed.correct);assertEquals(1,missed.distance);
        assertEquals(1,missed.missedSymbols.length);
    }
    @Test public void localFormattingDoesNotAffectCorrectness(){
        MorseCourse.Progress state=new MorseCourse.Progress();
        DailyTraining.Task task=DailyTraining.task(18,state,alphabet,true,new Random(9),1000L);
        String spelled=task.target.substring(0,1)+" "+task.target.substring(1);
        assertTrue(DailyTraining.assess(task,spelled).correct);
    }
    @Test public void dueDatesAndAssistanceDoNotFakeMastery(){
        MorseCourse.Progress state=new MorseCourse.Progress();
        state.dueAt[0]=1000L;state.dueAt[1]=5000L;
        assertEquals(1,DailyTraining.dueCount(state,3000L));
        DailyTraining.Task task=DailyTraining.task(0,state,alphabet,true,new Random(1),3000L);
        assertTrue(DailyTraining.appliesToMastery(task,false));
        assertFalse(DailyTraining.appliesToMastery(task,true));
    }
    @Test public void allExerciseTargetsAreSupportedMorseCodes(){
        MorseCourse.Progress state=new MorseCourse.Progress();
        state.unlocked=alphabet.size();
        for(int i=0;i<DailyTraining.TOTAL;i++){
            DailyTraining.Task task=DailyTraining.task(i,state,alphabet,true,new Random(i),1000L);
            for(String symbol:CwCoursePlan.tokenize(task.target))
                assertNotNull(CwCoursePlan.code(symbol));
        }
    }
}
