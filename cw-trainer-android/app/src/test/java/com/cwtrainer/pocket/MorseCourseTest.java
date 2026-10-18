package com.cwtrainer.pocket;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class MorseCourseTest {
    @Test public void internationalAndRussianAlphabetsHaveUniqueCodes() {
        List<MorseCourse.Symbol> en=MorseCourse.alphabet(false), ru=MorseCourse.alphabet(true);
        assertEquals(36,en.size());assertEquals(42,ru.size());
        assertEquals("A",en.get(0).label(false));
        assertEquals("E",en.get(1).label(false));
        assertEquals("N",en.get(2).label(false));
        assertEquals("T",en.get(3).label(false));
        assertEquals("А",ru.get(0).label(true));
        for(List<MorseCourse.Symbol> list:Arrays.asList(en,ru)){
            Set<String> seen=new HashSet<>();
            for(MorseCourse.Symbol item:list) {
                assertTrue(item.code,seen.add(item.code));
                assertTrue(item.code.matches("[.-]+"));
                assertFalse(item.label(list==ru).isEmpty());
            }
        }
    }
    @Test public void gradedAnswersRequireFortyUnaidedAttemptsAndAllFirstFourSymbols() {
        MorseCourse.Progress p=new MorseCourse.Progress();
        long now=100000000L;boolean promoted=false;
        for(int i=0;i<40;i++)
            promoted |= p.record(i%4,true,false,36,now);
        assertTrue(promoted);assertEquals(5,p.unlocked);assertEquals(0,p.attempts);
    }
    @Test public void choiceTrainingDoesNotProgressAndAssistedAnswersDoNotCountAsMastery() {
        MorseCourse.Progress p=new MorseCourse.Progress();
        long now=100000000L;
        for(int i=0;i<50;i++)p.record(i%4,true,true,36,now);
        assertEquals(4,p.unlocked);assertEquals(0,p.cleanCorrect);assertEquals(0,p.accuracy());
    }
    @Test public void AccuracyBelowThresholdBlocksPromotion() {
        MorseCourse.Progress p=new MorseCourse.Progress();
        for(int i=0;i<40;i++)p.record(i%4,i%8!=0,false,36,100000L);
        assertEquals(4,p.unlocked);assertEquals(87,p.accuracy());
    }
    @Test public void NewSymbolMustBePresentedAtLeastEightTimes() {
        MorseCourse.Progress p=new MorseCourse.Progress();
        for(int i=0;i<40;i++)p.record(i%4,true,false,36,100000L);
        assertEquals(5,p.unlocked);
        for(int i=0;i<45;i++)assertFalse(p.record(i%4,true,false,36,110000L));
        assertEquals(5,p.unlocked);
        for(int i=0;i<8;i++)p.record(4,true,false,36,110000L);
        assertEquals(6,p.unlocked);
    }
    @Test public void SerializationRetainsStageAndRepeatSchedule(){
        MorseCourse.Progress p=new MorseCourse.Progress();long t=1000000L;
        p.record(0,true,false,36,t);
        assertEquals(t+86400000L,p.dueAt[0]);
        // Additional rehearsal on the same day must not extend the interval.
        p.record(0,true,false,36,t+60000L);
        assertEquals(t+86400000L,p.dueAt[0]);
        long day1=t+86400000L+1L;
        p.record(0,true,false,36,day1);
        assertEquals(day1+3*86400000L,p.dueAt[0]);
        long day4=day1+3*86400000L+1L;
        p.record(0,true,false,36,day4);
        assertEquals(day4+7*86400000L,p.dueAt[0]);
        MorseCourse.Progress restored=MorseCourse.Progress.parse(p.serialize(),36);
        assertEquals(p.dueAt[0],restored.dueAt[0]);
        assertEquals(p.attempts,restored.attempts);
        assertEquals(4,restored.unlocked);
        assertEquals(4,MorseCourse.Progress.parse("broken",36).unlocked);
    }
    @Test public void RandomSelectionNeverShowsLockedCharacter() {
        MorseCourse.Progress p=new MorseCourse.Progress();
        for(int i=0;i<1000;i++)assertTrue(p.choose(new Random(i),100000L)<4);
    }
}
