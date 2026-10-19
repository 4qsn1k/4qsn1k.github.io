package com.cwtrainer.pocket;

import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.Button;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class DailyPracticeActivityTest {
    private static Object field(Object app,String name)throws Exception{
        Field f=app.getClass().getDeclaredField(name);
        f.setAccessible(true);return f.get(app);
    }
    private DailyPracticeActivity launch(boolean ru){
        Intent intent=new Intent(RuntimeEnvironment.getApplication(),DailyPracticeActivity.class);
        intent.putExtra("russian",ru);
        return Robolectric.buildActivity(DailyPracticeActivity.class,intent).setup().get();
    }
    @Test public void startsWithGuidedSingleSymbolsAndBlankHiddenAnswer()throws Exception{
        SharedPreferences prefs=RuntimeEnvironment.getApplication().getSharedPreferences("cw_daily_practice",0);
        prefs.edit().clear().commit();
        DailyPracticeActivity app=launch(true);
        assertEquals(0,field(app,"index"));
        assertEquals(true,field(app,"russian"));
        assertEquals("?",((TextView)field(app,"question")).getText().toString());
        DailyTraining.Task t=(DailyTraining.Task)field(app,"task");
        assertEquals(1,t.symbols.length);
        assertEquals(1,t.target.length());
    }
    @Test public void gradingIsBlockedUntilSoundCompletes()throws Exception{
        RuntimeEnvironment.getApplication().getSharedPreferences("cw_daily_practice",0).edit().clear().commit();
        DailyPracticeActivity app=launch(true);
        ((android.widget.EditText)field(app,"entry")).setText("А");
        ((Button)field(app,"submit")).performClick();
        assertEquals(0,field(app,"index"));
        assertFalse((Boolean)field(app,"answered"));
        ((Button)field(app,"skip")).performClick();
        assertEquals(1,field(app,"index"));
        SharedPreferences stats=RuntimeEnvironment.getApplication().getSharedPreferences("cw_daily_practice",0);
        assertEquals(1,stats.getInt("index",0));
    }
    @Test public void dayProgressIsResumable()throws Exception{
        SharedPreferences stats=RuntimeEnvironment.getApplication().getSharedPreferences("cw_daily_practice",0);
        stats.edit().clear().commit();
        DailyPracticeActivity app=launch(true);
        ((Button)field(app,"skip")).performClick();
        assertEquals(1,stats.getInt("index",0));
    }
}
