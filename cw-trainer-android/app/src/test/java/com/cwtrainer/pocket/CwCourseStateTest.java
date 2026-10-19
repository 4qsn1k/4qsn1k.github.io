package com.cwtrainer.pocket;
import static org.junit.Assert.*;
import org.junit.Test;
public class CwCourseStateTest {
    @Test public void masteryRequiresIndependentMixedSkills(){
        CwCourseState s=new CwCourseState();
        for(int n=0;n<30;n++)s.grade(1,CwCoursePlan.Kind.CHARACTER,true,200000000L);
        assertEquals(1,s.unlocked);
        for(int n=0;n<8;n++)s.grade(1,CwCoursePlan.Kind.GROUP,true,200000000L);
        for(int n=0;n<6;n++)s.grade(1,CwCoursePlan.Kind.WORD,true,200000000L);
        assertEquals(2,s.unlocked);
        assertTrue(s.passed(1));
    }
    @Test public void poorAccuracyDoesNotPass(){
        CwCourseState s=new CwCourseState();
        for(int n=0;n<30;n++)
            s.grade(1,n<10?CwCoursePlan.Kind.WORD:(n<20?CwCoursePlan.Kind.GROUP:CwCoursePlan.Kind.CHARACTER),
                n>=6,200000000L);
        assertEquals(1,s.unlocked);
        assertEquals(80,s.accuracy(1));
    }
    @Test public void secondStageMustContainCallsignTraining(){
        CwCourseState s=new CwCourseState();s.unlocked=2;
        for(int i=0;i<10;i++)s.grade(2,CwCoursePlan.Kind.CHARACTER,true,200000000L);
        for(int i=0;i<10;i++)s.grade(2,CwCoursePlan.Kind.GROUP,true,200000000L);
        for(int i=0;i<10;i++)s.grade(2,CwCoursePlan.Kind.WORD,true,200000000L);
        assertEquals(2,s.unlocked);
        for(int i=0;i<3;i++)s.grade(2,CwCoursePlan.Kind.CALLSIGN,true,200000000L);
        assertEquals(3,s.unlocked);
    }
    @Test public void progressRoundTripPersistsScores(){
        CwCourseState s=new CwCourseState();
        s.grade(1,CwCoursePlan.Kind.CHARACTER,true,200000000L);
        s.grade(1,CwCoursePlan.Kind.GROUP,false,200000000L);
        CwCourseState restored=CwCourseState.load(s.save());
        assertEquals(s.correct[0],restored.correct[0]);
        assertEquals(s.attempts[0],restored.attempts[0]);
        assertEquals(1,restored.daysPracticed);
        assertEquals(1,CwCourseState.load("invalid").unlocked);
    }
}
