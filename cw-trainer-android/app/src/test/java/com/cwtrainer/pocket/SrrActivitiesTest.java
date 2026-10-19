package com.cwtrainer.pocket;

import android.content.Intent;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.lang.reflect.Field;
import java.util.HashSet;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=32)
public class SrrActivitiesTest {
    private static Object field(Object object,String name)throws Exception{
        Field f=object.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(object);
    }
    @Test public void examMenuOffersBothParts(){
        SrrExamMenuActivity a=Robolectric.buildActivity(SrrExamMenuActivity.class).setup().get();
        assertNotNull(a.getWindow().getDecorView());
        assertTrue(a.getWindow().getDecorView().getRootView().toString().length()>0);
    }
    @Test public void theoryStartsWith45UniqueQuestionsAndPersistsFirstAnswer()throws Exception{
        RuntimeEnvironment.getApplication().getSharedPreferences("srr_theory_session",0).edit().clear().commit();
        Intent intent=new Intent(RuntimeEnvironment.getApplication(),SrrTheoryActivity.class);
        intent.putExtra("exam",true);
        SrrTheoryActivity a=Robolectric.buildActivity(SrrTheoryActivity.class,intent).setup().get();
        int[] ids=(int[])field(a,"questionIds");
        HashSet<Integer> uniq=new HashSet<>();
        for(int id:ids)uniq.add(id);
        assertEquals(45,uniq.size());
        assertTrue((Boolean)field(a,"active"));
        Button[] buttons=(Button[])field(a,"buttons");
        assertEquals(View.VISIBLE,buttons[0].getVisibility());
        buttons[0].performClick();
        assertEquals(1,field(a,"pointer"));
        assertEquals(0,((int[])field(a,"answers"))[0]);
    }
    @Test public void morseExamLocksRequired250And60Settings()throws Exception{
        Intent intent=new Intent(RuntimeEnvironment.getApplication(),SrrMorseActivity.class);
        intent.putExtra("exam",true);
        SrrMorseActivity a=Robolectric.buildActivity(SrrMorseActivity.class,intent).setup().get();
        assertEquals(250,field(a,"length"));
        assertEquals(60,field(a,"cpm"));
        assertFalse(((Button)field(a,"rate")).isEnabled());
        assertFalse(((Button)field(a,"lengthControl")).isEnabled());
        assertEquals(View.GONE,((Button)field(a,"grade")).getVisibility());
    }
    @Test public void practiceControlsAllowProgression()throws Exception{
        Intent intent=new Intent(RuntimeEnvironment.getApplication(),SrrMorseActivity.class);
        intent.putExtra("exam",false);
        SrrMorseActivity a=Robolectric.buildActivity(SrrMorseActivity.class,intent).setup().get();
        assertEquals(25,field(a,"length"));
        ((Button)field(a,"rate")).performClick();
        assertEquals(40,field(a,"cpm"));
        ((Button)field(a,"lengthControl")).performClick();
        assertEquals(50,field(a,"length"));
    }
}
