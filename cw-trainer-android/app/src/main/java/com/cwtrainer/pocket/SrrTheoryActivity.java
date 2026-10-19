package com.cwtrainer.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/** Offline exam: all 426 verified SRR questions or 45-question timed mock. */
public final class SrrTheoryActivity extends Activity {
    private static final int BG=Color.rgb(12,24,35),PANEL=Color.rgb(30,46,61);
    private static final int GREEN=Color.rgb(36,132,117),RED=Color.rgb(150,70,72);
    private static final int WHITE=Color.WHITE,MUTED=Color.rgb(177,199,212);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Random random=new Random();
    private SrrQuestionBank bank;
    private SharedPreferences prefs,results;
    private boolean exam=false,active=false,answered=false;
    private long startedAt=0;
    private int pointer=0;
    private final int[] questionIds=new int[45],answers=new int[45];
    private SrrQuestionBank.Question current;
    private LinearLayout root;
    private TextView heading,timer,prompt,feedback;
    private final Button[] buttons=new Button[4];
    private Button next,reset,sourcePdf;
    private ScrollView scroll;
    private final Runnable clock=new Runnable(){
        @Override public void run(){
            if(exam && active){
                long remaining=SrrExamEngine.THEORY_LIMIT_MS-(System.currentTimeMillis()-startedAt);
                if(remaining<=0){finishExam(true);return;}
                if(timer!=null)timer.setText("Осталось "+String.format(Locale.ROOT,"%02d:%02d",
                    remaining/60000,(remaining/1000)%60));
                handler.postDelayed(this,1000);
            }
        }
    };
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private TextView text(String value,int size,int color){
        TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
        return t;
    }
    private void add(android.view.View v,int top){
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
        lp.setMargins(0,dp(top),0,0);root.addView(v,lp);
    }
    private Button button(String label,int color){
        Button b=new Button(this);b.setText(label);b.setTextSize(16);b.setTextColor(WHITE);
        b.setAllCaps(false);b.setMinHeight(dp(57));
        b.setGravity(Gravity.CENTER_VERTICAL|Gravity.START);
        b.setPadding(dp(15),dp(8),dp(15),dp(8));
        b.setBackgroundTintList(ColorStateList.valueOf(color));return b;
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        exam=getIntent().getBooleanExtra("exam",false);
        prefs=getSharedPreferences("srr_theory_session",Context.MODE_PRIVATE);
        results=getSharedPreferences("srr_exam_results",Context.MODE_PRIVATE);
        try {bank=new SrrQuestionBank(this);}
        catch(Exception e){showLoadError(e);return;}
        buildUI();
        if(exam){if(!restore())newExam();else render();}
        else nextPractice();
    }
    private void showLoadError(Exception e){
        TextView message=text("Не удалось открыть банк из 426 вопросов:\n"+e,18,WHITE);
        message.setPadding(dp(20),dp(40),dp(20),0);message.setBackgroundColor(BG);
        setContentView(message);
    }
    private void buildUI(){
        scroll=new ScrollView(this);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14),dp(15),dp(14),dp(22));root.setBackgroundColor(BG);
        scroll.addView(root);setContentView(scroll);
        heading=text(exam?"ТЕОРИЯ · ПРОБНЫЙ ЭКЗАМЕН":"ТЕОРИЯ · 426 ВОПРОСОВ",21,Color.rgb(109,231,197));
        heading.setGravity(Gravity.CENTER);add(heading,0);
        timer=text(exam?"90 минут · 45 вопросов · нужно 40":"Тренировка без ограничения времени",15,MUTED);
        timer.setGravity(Gravity.CENTER);add(timer,7);
        prompt=text("",19,WHITE);add(prompt,18);
        for(int i=0;i<4;i++){
            final int index=i;
            buttons[i]=button("",PANEL);add(buttons[i],7);
            buttons[i].setOnClickListener(v->select(index));
        }
        feedback=text("",16,MUTED);add(feedback,12);
        next=button("Следующий вопрос",GREEN);add(next,9);
        next.setOnClickListener(v->nextPractice());
        sourcePdf=button("📄 Показать оригинал вопроса и рисунки",PANEL);
        add(sourcePdf,7);
        sourcePdf.setOnClickListener(v->{
            if(exam||current==null)return;
            Intent intent=new Intent(this,SrrOriginalPdfActivity.class);
            intent.putExtra("questionId",current.id);
            startActivity(intent);
        });
        sourcePdf.setVisibility(exam?android.view.View.GONE:android.view.View.VISIBLE);
        reset=button(exam?"Начать новый экзамен":"← Выход",PANEL);add(reset,16);
        reset.setOnClickListener(v->{
            if(exam)new android.app.AlertDialog.Builder(this)
                .setTitle("Начать новый экзамен?")
                .setMessage("Текущие ответы будут заменены. Время начнётся заново.")
                .setNegativeButton("Отмена",null)
                .setPositiveButton("Начать",(d,w)->newExam()).show();
            else finish();
        });
        add(text("Источники: опубликованный перечень СРР, вопросы 1–426. В экзамене ответы скрыты до завершения.",13,MUTED),16);
    }
    private void nextPractice(){
        if(bank==null)return;
        active=false;answered=false;current=bank.random(random);
        heading.setText("ТЕОРИЯ · ВОПРОС "+current.id+"/426");
        timer.setText("Практика · варианты из официального перечня");
        prompt.setText(current.prompt);
        for(int i=0;i<4;i++){
            buttons[i].setVisibility(android.view.View.VISIBLE);
            buttons[i].setText("ABCD".charAt(i)+") "+current.choices[i]);
            buttons[i].setEnabled(true);
            buttons[i].setBackgroundTintList(ColorStateList.valueOf(PANEL));
        }
        feedback.setText("");
        next.setVisibility(android.view.View.GONE);
        scroll.post(()->scroll.scrollTo(0,0));
    }
    private void newExam(){
        Arrays.fill(answers,-1);
        List<SrrQuestionBank.Question> selected=bank.mockExam(random);
        for(int i=0;i<45;i++)questionIds[i]=selected.get(i).id;
        pointer=0;active=true;answered=false;startedAt=System.currentTimeMillis();
        save();render();updateClock();
    }
    private void save(){
        if(!exam)return;
        StringBuilder ids=new StringBuilder(),ans=new StringBuilder();
        for(int i=0;i<45;i++){
            if(i>0){ids.append(',');ans.append(',');}
            ids.append(questionIds[i]);ans.append(answers[i]);
        }
        prefs.edit().putBoolean("active",active).putLong("started",startedAt)
            .putInt("pointer",pointer).putString("ids",ids.toString())
            .putString("answers",ans.toString()).apply();
    }
    private boolean restore(){
        if(!prefs.getBoolean("active",false))return false;
        try{
            String[] q=prefs.getString("ids","").split(",");
            String[] a=prefs.getString("answers","").split(",");
            if(q.length!=45||a.length!=45)return false;
            java.util.HashSet<Integer> uniq=new java.util.HashSet<>();
            for(int i=0;i<45;i++){
                questionIds[i]=Integer.parseInt(q[i]);
                answers[i]=Integer.parseInt(a[i]);
                if(questionIds[i]<1||questionIds[i]>426||!uniq.add(questionIds[i])||
                   answers[i]<-1||answers[i]>3)return false;
            }
            pointer=prefs.getInt("pointer",0);startedAt=prefs.getLong("started",0);
            if(pointer<0||pointer>=45||startedAt<=0)return false;
            active=true;
            if(System.currentTimeMillis()-startedAt>SrrExamEngine.THEORY_LIMIT_MS){
                finishExam(true);return true;
            }
            return true;
        }catch(RuntimeException ignored){return false;}
    }
    private void render(){
        if(!exam||!active)return;
        current=bank.get(questionIds[pointer]);
        answered=false;
        heading.setText("ТЕОРЕТИЧЕСКИЙ ЭКЗАМЕН · "+(pointer+1)+"/45");
        prompt.setText(current.prompt);
        feedback.setText("Выбери один ответ. Результаты покажем после 45 вопросов.");
        next.setVisibility(android.view.View.GONE);
        reset.setVisibility(android.view.View.VISIBLE);
        for(int i=0;i<4;i++){
            buttons[i].setText("ABCD".charAt(i)+") "+current.choices[i]);
            buttons[i].setEnabled(true);
            buttons[i].setBackgroundTintList(ColorStateList.valueOf(PANEL));
        }
        scroll.post(()->scroll.scrollTo(0,0));
    }
    private void select(int index){
        if(current==null||answered)return;
        if(exam){
            if(!active)return;
            if(System.currentTimeMillis()-startedAt>SrrExamEngine.THEORY_LIMIT_MS){finishExam(true);return;}
            answered=true;answers[pointer]=index;pointer++;
            if(pointer>=45){finishExam(false);return;}
            save();render();
        }else{
            answered=true;
            boolean right=index==current.correct;
            results.edit().putInt("practice_attempts",results.getInt("practice_attempts",0)+1)
                .putInt("practice_correct",results.getInt("practice_correct",0)+(right?1:0)).apply();
            feedback.setText((right?"✓ Правильно":"✕ Неправильно")+
                "\nВерный ответ: "+"ABCD".charAt(current.correct)+") "+current.choices[current.correct]);
            for(int i=0;i<4;i++){
                buttons[i].setEnabled(false);
                buttons[i].setBackgroundTintList(ColorStateList.valueOf(
                  i==current.correct?GREEN:i==index?RED:PANEL));
            }
            next.setVisibility(android.view.View.VISIBLE);
        }
    }
    private void updateClock(){
        handler.removeCallbacks(clock);
        if(exam&&active)handler.post(clock);
    }
    private void finishExam(boolean timedOut){
        if(!exam||bank==null)return;
        handler.removeCallbacks(clock);
        active=false;save();
        int correct=0,answeredCount=0;
        StringBuilder wrong=new StringBuilder();
        for(int i=0;i<45;i++){
            int answer=answers[i];
            if(answer>=0)answeredCount++;
            SrrQuestionBank.Question q=bank.get(questionIds[i]);
            if(answer==q.correct)correct++;
            else if(wrong.length()<900)wrong.append("№").append(q.id).append(" ");
        }
        long elapsed=Math.max(0,System.currentTimeMillis()-startedAt);
        boolean pass=!timedOut && SrrExamEngine.theoryPassed(correct,45,elapsed);
        results.edit().putInt("theory_correct",correct).putBoolean("theory_pass",pass)
            .putLong("theory_date",System.currentTimeMillis()).apply();
        heading.setText(pass?"✓ ТЕОРИЯ: ПРОЙДЕНА":"ТЕОРИЯ: НЕ ПРОЙДЕНА");
        prompt.setText("Правильно: "+correct+"/45\nОшибок: "+(45-correct)+
          "\nОтвечено: "+answeredCount+"/45\nВремя: "+(elapsed/60000)+" мин"+
          (timedOut?"\nВремя истекло":""));
        timer.setText("Требование: минимум 40 правильных за 90 минут");
        for(Button b:buttons)b.setVisibility(android.view.View.GONE);
        feedback.setText("Вопросы для повторения:\n"+wrong);
        reset.setText("Новый пробный экзамен");
        next.setVisibility(android.view.View.GONE);
        scroll.post(()->scroll.scrollTo(0,0));
    }
    @Override public void onResume(){super.onResume();if(exam)updateClock();}
    @Override public void onPause(){handler.removeCallbacks(clock);super.onPause();}
    @Override public void onDestroy(){handler.removeCallbacks(clock);super.onDestroy();}
}
