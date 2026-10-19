package com.cwtrainer.pocket;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;
public class CwCoursePlanTest {
    @Test public void officialSessionIntroductionOrderIsComplete(){
        assertEquals(16,CwCoursePlan.sessions());
        assertEquals(Arrays.asList("A","E","N","T"),CwCoursePlan.newSymbols(1));
        assertEquals(Arrays.asList("S","I","O","1","4"),CwCoursePlan.newSymbols(2));
        assertEquals(Arrays.asList("X","Z",".","<BK>","<SK>"),CwCoursePlan.newSymbols(10));
        assertEquals(44,CwCoursePlan.introduced(10).size());
        Set<String> unique=new HashSet<>(CwCoursePlan.introduced(10));
        assertEquals(44,unique.size());
        for(int s=11;s<=16;s++)assertEquals(44,CwCoursePlan.introduced(s).size());
        assertEquals(".-.-.",CwCoursePlan.code("<AR>"));
        assertEquals("-...-",CwCoursePlan.code("<BT>"));
        assertEquals("-...-.-",CwCoursePlan.code("<BK>"));
        assertEquals("...-.-",CwCoursePlan.code("<SK>"));
    }
    @Test public void allExercisesUseOnlyLearnedSymbols(){
        for(int s=1;s<=16;s++)
            for(CwCoursePlan.Kind kind:CwCoursePlan.Kind.values()){
                for(String item:CwCoursePlan.exercises(s,kind))
                    assertTrue("Session "+s+", kind "+kind+": "+item,CwCoursePlan.isIntroduced(item,s));
                for(int seed=0;seed<8;seed++){
                    if(kind==CwCoursePlan.Kind.SENDING)continue;
                    String item=CwCoursePlan.next(s,kind,new Random(seed));
                    assertTrue("Generated illegal: "+item,CwCoursePlan.isIntroduced(item,s));
                }
            }
    }
    @Test public void audioRendersFarnsworthGapAndCorrectLength(){
        CwAudioSequence.Timing a=CwAudioSequence.timing(25,6);
        assertEquals(48.0,a.ditMs,0.001);
        assertTrue(a.gapMs>a.ditMs*3);
        CwAudioSequence.Timing b=CwAudioSequence.timing(25,25);
        assertEquals(b.ditMs,b.gapMs,0.001);
        byte[] sample=CwAudioSequence.render("CQ DE W1AW <AR>",25,6);
        assertTrue(sample.length>150000);
        boolean nonzero=false;
        for(int i=0;i<sample.length;i++)if(sample[i]!=0){nonzero=true;break;}
        assertTrue(nonzero);
    }
    @Test public void multiCharacterAndProsignTokens(){
        List<String> t=CwCoursePlan.tokenize("W1AW <SK>");
        assertEquals(Arrays.asList("W","1","A","W"," ","<SK>"),t);
        assertTrue(CwCoursePlan.isIntroduced("CQ CQ DE W1AW K",10));
        assertFalse(CwCoursePlan.isIntroduced("W1AW",1));
    }
}
