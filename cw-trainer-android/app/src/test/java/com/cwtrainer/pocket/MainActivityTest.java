package com.cwtrainer.pocket;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import android.app.Activity;
import android.widget.Button;
import android.widget.TextView;
import android.view.View;
import android.widget.LinearLayout;

import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 32)
public class MainActivityTest {
    @Test public void mainScreenLaunches() {
        MainActivity activity=Robolectric.buildActivity(MainActivity.class).setup().get();
        assertNotNull(activity);
        View root=activity.getWindow().getDecorView();
        assertNotNull(root);
        View title=root.findViewById(android.R.id.content);
        assertNotNull(title);
    }
}
