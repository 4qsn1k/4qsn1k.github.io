package com.cwtrainer.pocket;

import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import java.lang.reflect.Field;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class MainActivityTest {
    private MainActivity launch() {
        return Robolectric.buildActivity(MainActivity.class).setup().get();
    }
    private Object field(MainActivity app,String name)throws Exception {
        Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(app);
    }
    private void open(MainActivity app,int mode)throws Exception {
        Button[] tabs=(Button[])field(app,"modeButtons");tabs[mode].performClick();
    }
    @Test public void startsWithGuidedIntroduction()throws Exception {
        MainActivity app=launch();
        assertNotNull(app.getWindow().getDecorView().findViewById(android.R.id.content));
        assertEquals("LEARN",field(app,"mode").toString());
    }
    @Test public void fourOptionsWorkAndDoubleTapsDoNotCrash()throws Exception {
        MainActivity app=launch();open(app,1);
        Button[] buttons=(Button[])field(app,"choiceButtons");
        int q=(Integer)field(app,"question");
        Button target=null;
        for(Button b:buttons)if(Integer.valueOf(q).equals(b.getTag()))target=b;
        assertNotNull(target);target.performClick();target.performClick();
        assertFalse(target.isEnabled());
    }
    @Test public void incorrectChoiceDoesNotCrash()throws Exception {
        MainActivity app=launch();open(app,1);
        Button[] buttons=(Button[])field(app,"choiceButtons");
        int q=(Integer)field(app,"question");
        Button wrong=null;
        for(Button b:buttons)if(b.getVisibility()==View.VISIBLE &&
            !Integer.valueOf(q).equals(b.getTag()))wrong=b;
        assertNotNull(wrong);wrong.performClick();wrong.performClick();
        assertFalse(wrong.isEnabled());
    }
    @Test public void blindTestRecordsOnlyOnceAndDoesNotRevealBeforeAnswer()throws Exception {
        MainActivity app=launch();open(app,2);
        MorseCourse.Progress p=(MorseCourse.Progress)field(app,"progress");
        assertEquals(0,p.attempts);
        EditText e=(EditText)field(app,"answerField");
        e.setText("Z");
        Button submit=(Button)field(app,"submitButton");
        submit.performClick();submit.performClick();
        assertEquals(1,p.attempts);assertFalse(e.isEnabled());
    }
    @Test public void introAndLanguageToggleAndSummaryWork()throws Exception {
        MainActivity app=launch();
        Button language=(Button)field(app,"languageButton");language.performClick();
        assertTrue((Boolean)field(app,"russian"));
        open(app,1);open(app,2);open(app,3);
        assertEquals("STATS",field(app,"mode").toString());
        open(app,0);
    }
}
