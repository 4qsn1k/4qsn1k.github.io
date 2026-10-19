package com.cwtrainer.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Official-norm practice portal. The app is not an SRR examination service. */
public final class SrrExamMenuActivity extends Activity {
    private static final int BG=Color.rgb(12,24,35),PANEL=Color.rgb(30,46,61);
    private static final int GREEN=Color.rgb(30,140,119),WHITE=Color.WHITE,MUTED=Color.rgb(185,203,213);
    private LinearLayout root;
    private TextView details;
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private TextView label(String value,int size,int color){
        TextView v=new TextView(this);v.setText(value);v.setTextSize(size);
        v.setTextColor(color);v.setGravity(Gravity.CENTER);
        return v;
    }
    private void add(android.view.View view,int margin){
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,dp(margin),0,0);root.addView(view,p);
    }
    private Button button(String title,int color){
        Button b=new Button(this);b.setText(title);b.setTextColor(WHITE);
        b.setTextSize(17);b.setAllCaps(false);b.setMinHeight(dp(60));
        b.setBackgroundTintList(ColorStateList.valueOf(color));return b;
    }
    @Override public void onCreate(Bundle bundle){
        super.onCreate(bundle);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        ScrollView scroll=new ScrollView(this);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16),dp(16),dp(16),dp(20));root.setBackgroundColor(BG);
        scroll.addView(root);setContentView(scroll);
        add(label("1-Я КАТЕГОРИЯ · РФ",22,Color.rgb(114,224,192)),4);
        add(label("Тренажёр по нормативам СРР. Это не официальный квалификационный экзамен.",15,MUTED),8);
        add(label("ТЕОРИЯ: 45 вопросов / 90 минут / 40 правильных\nПРИЁМ: 250 знаков / 60 зн/мин / не более 3 ошибок",16,WHITE),15);
        Button learn=button("📚 Изучать 426 вопросов",PANEL);add(learn,16);
        learn.setOnClickListener(v->startTheory(false));
        Button theory=button("📝 Пробный экзамен по теории",GREEN);add(theory,6);
        theory.setOnClickListener(v->startTheory(true));
        Button shortCw=button("🎧 Тренировка непрерывного приёма",PANEL);add(shortCw,14);
        shortCw.setOnClickListener(v->startMorse(false));
        Button cw=button("🎯 Пробный экзамен по Морзе",GREEN);add(cw,6);
        cw.setOnClickListener(v->startMorse(true));
        details=label("",14,MUTED);add(details,18);
        add(label("Непрерывный звук. Без повторов на экзамене. После окончания — подсчёт замен, пропусков и лишних знаков.",13,MUTED),8);
        Button back=button("← Назад к курсу",PANEL);add(back,20);
        back.setOnClickListener(v->finish());
    }
    private void startTheory(boolean exam){
        Intent i=new Intent(this,SrrTheoryActivity.class);
        i.putExtra("exam",exam);startActivity(i);
    }
    private void startMorse(boolean exam){
        Intent i=new Intent(this,SrrMorseActivity.class);
        i.putExtra("exam",exam);startActivity(i);
    }
    @Override public void onResume(){
        super.onResume();
        if(details==null)return;
        SharedPreferences p=getSharedPreferences("srr_exam_results",Context.MODE_PRIVATE);
        details.setText("ТВОЙ ПРОГРЕСС\nТеория: "+p.getInt("theory_correct",0)+"/45"+
          "\nМорзе: "+(p.contains("morse_errors")?p.getInt("morse_errors",250)+" ошибок":"экзамен ещё не проходил")+
          "\nТренировки теории: "+p.getInt("practice_attempts",0)+" вопросов");
    }
}
