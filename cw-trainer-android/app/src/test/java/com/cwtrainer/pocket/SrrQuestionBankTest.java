package com.cwtrainer.pocket;
import android.app.Application;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class SrrQuestionBankTest {
    @Test public void officialBankHasAllQuestionsAndCorrectKeys() throws Exception {
        SrrQuestionBank bank=new SrrQuestionBank(RuntimeEnvironment.getApplication());
        assertEquals(426,bank.size());
        assertEquals(1,bank.get(1).id);
        assertEquals(3,bank.get(1).correct); // question 1 -> d
        assertEquals(2,bank.get(426).correct); // question 426 -> c
        assertEquals(4,bank.get(426).choices.length);
        for(int i=1;i<=426;i++){
            SrrQuestionBank.Question q=bank.get(i);
            assertEquals(i,q.id);
            assertTrue(q.prompt.length()>3);
            assertTrue(q.correct>=0 && q.correct<4);
            for(String choice:q.choices)assertFalse(choice.trim().isEmpty());
        }
    }
    @Test public void examHas45DifferentQuestions()throws Exception {
        SrrQuestionBank bank=new SrrQuestionBank(RuntimeEnvironment.getApplication());
        List<SrrQuestionBank.Question> questions=bank.mockExam(new Random(13));
        assertEquals(45,questions.size());
        Set<Integer> unique=new HashSet<>();
        for(SrrQuestionBank.Question q:questions)unique.add(q.id);
        assertEquals(45,unique.size());
        Set<Integer> topicIds=new HashSet<>();
        for(SrrQuestionBank.Question q:questions)
            topicIds.add(SrrQuestionBank.topicOf(q.id));
        assertEquals("Mock should cover all eight subjects",8,topicIds.size());
        assertEquals(0,SrrQuestionBank.topicOf(1));
        assertEquals(7,SrrQuestionBank.topicOf(426));
    }
}
