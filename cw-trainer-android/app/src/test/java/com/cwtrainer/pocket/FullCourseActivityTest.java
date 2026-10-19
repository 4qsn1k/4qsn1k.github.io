package com.cwtrainer.pocket;

import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class FullCourseActivityTest {
    private FullCourseActivity launch(){
        return Robolectric.buildActivity(FullCourseActivity.class).setup().get();
    }
    private Object field(Object target,String name)throws Exception {
        Field f=target.getClass().getDeclaredField(name);
        f.setAccessible(true);return f.get(target);
    }
    private Button button(FullCourseActivity activity,String snippet) {
        View root=activity.getWindow().getDecorView();
        return findButton(root,snippet);
    }
    private Button findButton(View root,String snippet){
        if(root instanceof Button && ((Button)root).getText().toString().contains(snippet))
            return (Button)root;
        if(root instanceof android.view.ViewGroup){
            android.view.ViewGroup group=(android.view.ViewGroup)root;
            for(int i=0;i<group.getChildCount();i++){
                Button match=findButton(group.getChildAt(i),snippet);
                if(match!=null)return match;
            }
        }
        return null;
    }
    @Test public void allSixteenSessionsAreListedButLaterSessionsLocked()throws Exception{
        FullCourseActivity activity=launch();
        assertNotNull(button(activity,"01 ·"));
        Button session16=button(activity,"16 ·");
        assertNotNull(session16);
        assertFalse(session16.isEnabled());
        assertEquals("OVERVIEW",field(activity,"screen").toString());
    }
    @Test public void practiceCanSwitchToUnguidedExam()throws Exception{
        FullCourseActivity activity=launch();
        Button practice=button(activity,"Тренировка");
        assertNotNull(practice);practice.performClick();
        assertEquals("PRACTICE",field(activity,"screen").toString());
        assertFalse(((String)field(activity,"expected")).isEmpty());
        Button exam=button(activity,"Контроль");
        assertNotNull(exam);exam.performClick();
        assertEquals("CHECK",field(activity,"screen").toString());
        EditText input=(EditText)field(activity,"answerInput");
        input.setText("Z");
        Button submit=(Button)field(activity,"submit");
        submit.performClick();
        CwCourseState state=(CwCourseState)field(activity,"state");
        assertEquals(1,state.attempts[0]);
    }
    @Test public void sendingScreenOpensAndShowsOneTarget()throws Exception{
        FullCourseActivity activity=launch();
        Button sending=button(activity,"Передача");
        assertNotNull(sending);sending.performClick();
        assertEquals("SEND",field(activity,"screen").toString());
        assertTrue(CwCoursePlan.introduced(1).contains((String)field(activity,"sendExpected")));
    }
}
