package com.cwtrainer.pocket;

import android.view.View;
import android.widget.Button;
import java.lang.reflect.Field;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 32)
public class MainActivityTest {
    private MainActivity launch() {
        MainActivity activity=Robolectric.buildActivity(MainActivity.class).setup().get();
        assertNotNull(activity.getWindow().getDecorView().findViewById(android.R.id.content));
        return activity;
    }
    private Button[] options(MainActivity activity) throws Exception {
        Field field=MainActivity.class.getDeclaredField("answers");
        field.setAccessible(true);
        return (Button[])field.get(activity);
    }
    private int currentQuestion(MainActivity activity) throws Exception {
        Field field=MainActivity.class.getDeclaredField("question");
        field.setAccessible(true);
        return field.getInt(activity);
    }
    @Test public void mainScreenLaunches() { launch(); }
    @Test public void correctAnswerDoesNotCrashWithTwoVisibleChoices() throws Exception {
        MainActivity activity=launch();
        Button[] buttons=options(activity);
        int correct=currentQuestion(activity);
        int visible=0;
        Button target=null;
        for(Button b:buttons) {
            if(b.getVisibility()==View.VISIBLE) {
                visible++;
                if(Integer.valueOf(correct).equals(b.getTag()))target=b;
            } else assertNull("Hidden answer must not retain a tag",b.getTag());
        }
        assertEquals(2,visible);
        assertNotNull(target);
        target.performClick();
        assertFalse("Clicked answer gets disabled",target.isEnabled());
        target.performClick(); // Ignore duplicate taps
    }
    @Test public void incorrectAnswerCanBeRetriedWithoutCrash() throws Exception {
        MainActivity activity=launch();
        Button[] buttons=options(activity);
        int correct=currentQuestion(activity);
        Button wrong=null;
        for(Button b:buttons)
            if(b.getVisibility()==View.VISIBLE && !Integer.valueOf(correct).equals(b.getTag()))wrong=b;
        assertNotNull(wrong);
        wrong.performClick();
        wrong.performClick(); // Multiple taps should not change grading
        assertFalse(wrong.isEnabled());
    }
    @Test public void introductionModeAnswersDoNotCrash() throws Exception {
        MainActivity activity=launch();
        Field field=MainActivity.class.getDeclaredField("mode");field.setAccessible(true);
        Button mode=(Button)field.get(activity);mode.performClick();
        for(Button b:options(activity))if(b.getVisibility()==View.VISIBLE){b.performClick();break;}
    }
}
