package com.cwtrainer.pocket;
import org.junit.Test;
import java.util.Random;
import static org.junit.Assert.*;

public class SrrExamEngineTest {
    @Test public void randomRadiogramIsExactly250UnpredictableChars() {
        String a=SrrExamEngine.randomRadiogram(new Random(11));
        String b=SrrExamEngine.randomRadiogram(new Random(12));
        assertNotEquals(a,b);
        assertEquals(250,SrrExamEngine.normalize(a).length());
        assertEquals(50,a.split(" ").length);
        for(String group:a.split(" ")) {
            assertEquals(5,group.length());
            assertTrue(group.matches("[A-Z0-9]{5}"));
        }
        assertEquals(25,SrrExamEngine.normalize(SrrExamEngine.randomRadiogram(new Random(2),25)).length());
    }
    @Test public void correctMissingInsertedAndWrongLettersCountProperly() {
        String source=SrrExamEngine.randomRadiogram(new Random(3));
        String plain=SrrExamEngine.normalize(source);
        assertEquals(0,SrrExamEngine.errors(source,plain));
        assertEquals(1,SrrExamEngine.errors(source,plain.substring(1)));
        assertEquals(1,SrrExamEngine.errors(source,"A"+plain));
        String corrupt=plain.substring(0,10)+(plain.charAt(10)=='X'?"Y":"X")+plain.substring(11);
        assertEquals(1,SrrExamEngine.errors(source,corrupt));
        assertEquals(3,SrrExamEngine.errors(source,plain.substring(3)));
        assertFalse(SrrExamEngine.morsePassed(4,250000));
        assertTrue(SrrExamEngine.morsePassed(3,250000));
        assertFalse(SrrExamEngine.morsePassed(3,900001));
    }
    @Test public void theoryThresholdIsExact(){
        assertTrue(SrrExamEngine.theoryPassed(40,45,5400000));
        assertFalse(SrrExamEngine.theoryPassed(39,45,1000));
        assertFalse(SrrExamEngine.theoryPassed(45,44,1000));
        assertFalse(SrrExamEngine.theoryPassed(45,45,5400001));
    }
    @Test public void audioTimeAndDotProportionsFollowTargetRate(){
        String t=SrrExamEngine.randomRadiogram(new Random(77));
        assertEquals(250000,CwExamAudio.durationMillis(t,60));
        assertEquals(300000,CwExamAudio.durationMillis(t,50));
        assertTrue(CwExamAudio.totalUnits(t)>1800);
        assertTrue(CwExamAudio.samplesPerDot(t,60)>1000);
        byte[] sample=CwExamAudio.renderAtRate(SrrExamEngine.randomRadiogram(new Random(11),5),80);
        assertEquals((int)(CwExamAudio.durationMillis(SrrExamEngine.randomRadiogram(new Random(11),5),80)*44100/1000)*2,sample.length);
        boolean audible=false;for(byte v:sample)if(v!=0){audible=true;break;}
        assertTrue("Exam PCM cannot be silent",audible);
    }
}
