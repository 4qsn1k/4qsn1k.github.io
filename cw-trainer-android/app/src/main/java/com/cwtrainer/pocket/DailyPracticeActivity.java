package com.cwtrainer.pocket;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.time.LocalDate;
import java.util.List;
import java.util.Random;

/** Self-contained daily coach. Only unassisted, first-play isolated decoding advances stage. */
public final class DailyPracticeActivity extends Activity {
    private static final int BG=Color.rgb(12,24,35),PANEL=Color.rgb(30,46,61);
    private static final int GREEN=Color.rgb(31,132,114),WHITE=Color.WHITE,MUTED=Color.rgb(180,202,215);
    private final Random random=new Random();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private MorseTonePlayer audio;
    private SharedPreferences prefs,daily;
    private MorseCourse.Progress progress;
    private List<MorseCourse.Symbol> alphabet;
    private boolean russian,answered=false;
    private int index,correct,errors,replays,replayed;
    private DailyTraining.Task task;
    private TextView title,summary,question,feedback,audioStatus;
    private EditText entry;
    private Button listen,submit,skip,next,language;
    private Runnable pending;
    private int generation=0;
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(String s,int size,int color){
        TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);
        t.setGravity(Gravity.CENTER);return t;
    }
    private Button button(String title,int color){
        Button b=new Button(this);b.setText(title);b.setAllCaps(false);b.setTextSize(17);
        b.setTextColor(WHITE);b.setMinHeight(dp(54));b.setBackgroundTintList(ColorStateList.valueOf(color));return b;
    }
    private LinearLayout root;
    private void add(View view,int top){
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);
        params.setMargins(0,dp(top),0,0);root.addView(view,params);
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        prefs=getSharedPreferences("cw_trainer_pocket",Context.MODE_PRIVATE);
        daily=getSharedPreferences("cw_daily_practice",Context.MODE_PRIVATE);
        russian=getIntent().hasExtra("russian")?
            getIntent().getBooleanExtra("russian",true):prefs.getBoolean("russian",false);
        loadLanguage();
        long day=LocalDate.now().toEpochDay();
        if(daily.getLong("day",-1)!=day || daily.getBoolean("language",!russian)!=russian) {
            daily.edit().clear().putLong("day",day).putBoolean("language",russian).apply();
        }
        index=Math.max(0,Math.min(DailyTraining.TOTAL,daily.getInt("index",0)));
        correct=daily.getInt("correct",0);
        errors=daily.getInt("errors",0);
        replays=daily.getInt("replays",0);
        audio=new MorseTonePlayer(this,status->{
            if(audioStatus!=null)audioStatus.setText("Аудио: "+status);
        });
        createUI();
        if(index<DailyTraining.TOTAL)nextTask();else done();
    }
    private void loadLanguage(){
        alphabet=MorseCourse.alphabet(russian);
        progress=MorseCourse.Progress.parse(prefs.getString(russian?"progress_ru":"progress_en",""),alphabet.size());
    }
    private void persist() {
        prefs.edit().putString(russian?"progress_ru":"progress_en",progress.serialize()).apply();
        daily.edit().putInt("index",index).putInt("correct",correct)
            .putInt("errors",errors).putInt("replays",replays).apply();
    }
    private void createUI(){
        ScrollView scroller=new ScrollView(this);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14),dp(17),dp(14),dp(26));root.setBackgroundColor(BG);
        scroller.addView(root);setContentView(scroller);
        title=text("ЕЖЕДНЕВНАЯ ТРЕНИРОВКА",22,Color.rgb(118,229,195));add(title,2);
        language=button("",PANEL);add(language,12);
        language.setOnClickListener(v->new android.app.AlertDialog.Builder(this)
            .setTitle("Сменить язык тренировки?")
            .setMessage("Результаты сохраняются отдельно. Незавершённая дневная серия начнётся заново.")
            .setNegativeButton("Отмена",null)
            .setPositiveButton("Сменить",(dialog,which)->{
                cancel();russian=!russian;loadLanguage();
                daily.edit().clear().putLong("day",LocalDate.now().toEpochDay())
                    .putBoolean("language",russian).apply();
                index=0;correct=0;errors=0;replays=0;nextTask();
            }).show());
        summary=text("",16,MUTED);add(summary,9);
        question=text("?",63,WHITE);question.setGravity(Gravity.CENTER);question.setMinHeight(dp(112));
        add(question,15);
        feedback=text("",17,MUTED);add(feedback,8);
        listen=button("▶ Слушать",GREEN);add(listen,10);
        listen.setOnClickListener(v->{
            if(answered||task==null)return;
            replayed++;
            audio.playText(task.target,25,6);
        });
        entry=new EditText(this);
        entry.setTextColor(WHITE);entry.setHintTextColor(MUTED);entry.setTextSize(25);
        entry.setInputType(android.text.InputType.TYPE_CLASS_TEXT|
            android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        entry.setSingleLine(true);entry.setHint("Введи услышанные знаки");
        entry.setGravity(Gravity.CENTER);add(entry,12);
        submit=button("Проверить",GREEN);add(submit,6);
        submit.setOnClickListener(v->grade(false));
        skip=button("Не разобрал",PANEL);add(skip,6);
        skip.setOnClickListener(v->grade(true));
        next=button("Далее",PANEL);add(next,7);
        next.setOnClickListener(v->nextTask());
        audioStatus=text("",12,MUTED);add(audioStatus,11);
        Button back=button("← Назад",PANEL);add(back,18);
        back.setOnClickListener(v->finish());
        add(text("Результат подсчитывается только с первого прослушивания. Повтор помогает учиться, но не повышает уровень. Сложные знаки появляются чаще.",13,MUTED),14);
    }
    private void cancel(){
        generation++;
        if(pending!=null)handler.removeCallbacks(pending);
        pending=null;audio.stop();
    }
    private void after(long millis,Runnable command){
        int version=generation;
        pending=()->{if(version==generation)command.run();};
        handler.postDelayed(pending,millis);
    }
    private void refresh(){
        language.setText(russian?"Язык: русский · сменить":"Язык: международный · сменить");
        int due=DailyTraining.dueCount(progress,System.currentTimeMillis());
        summary.setText("Задание "+(Math.min(index+1,DailyTraining.TOTAL))+"/"+DailyTraining.TOTAL+
            "\nОсвоено знаков: "+progress.unlocked+"/"+alphabet.size()+
            " · к повторению: "+due+
            "\nБез подсказок: "+correct+" · ошибок: "+errors);
    }
    private void nextTask(){
        if(index>=DailyTraining.TOTAL){done();return;}
        cancel();task=DailyTraining.task(index,progress,alphabet,russian,random,System.currentTimeMillis());
        answered=false;replayed=0;
        refresh();question.setText("?");question.setTextSize(63);
        feedback.setText(index<DailyTraining.SINGLE_COUNT?
            "Знакомый знак или новый знак текущего этапа":
            index<DailyTraining.SINGLE_COUNT+DailyTraining.PAIRS_COUNT?
            "Два знака подряд. Слушай оба, затем запиши.":"Непрерывная группа из пяти знаков.");
        entry.setEnabled(true);entry.setText("");submit.setEnabled(true);skip.setEnabled(true);
        listen.setVisibility(View.VISIBLE);next.setVisibility(View.GONE);
        after(650,()->audio.playText(task.target,25,6));
    }
    private void grade(boolean unknown){
        if(task==null||answered)return;
        String typed=unknown?"":entry.getText().toString();
        if(!unknown && DailyTraining.normalized(typed).isEmpty()){
            feedback.setText("Напиши ответ или нажми «Не разобрал».");return;
        }
        answered=true;cancel();hideKeyboard();
        DailyTraining.Assessment result=DailyTraining.assess(task,typed);
        boolean clean=result.correct&&replayed==0;
        if(clean)correct++;else errors++;
        if(replayed>0)replays++;
        boolean promoted=false;
        if(task.isolated) {
            promoted=progress.record(task.symbols[0],result.correct,replayed>0,alphabet.size(),
                System.currentTimeMillis());
        } else {
            // Group errors increase the priority of precisely the missed sounds.
            for(int symbol:result.missedSymbols){
                progress.misses[symbol]=Math.min(50,progress.misses[symbol]+2);
                progress.retentionLevel[symbol]=0;
                progress.dueAt[symbol]=System.currentTimeMillis();
            }
        }
        index++;persist();refresh();
        entry.setEnabled(false);submit.setEnabled(false);skip.setEnabled(false);
        listen.setVisibility(View.GONE);
        question.setText(task.target);question.setTextSize(task.target.length()>2?37:57);
        feedback.setText((result.correct?"✓ Распознано":"✕ Ошибка: "+result.distance)+
            (replayed>0?" · повторное прослушивание, не зачтено":"")+
            (promoted?"\nОТКРЫТ СЛЕДУЮЩИЙ ЗНАК":"")+
            "\nТвой ответ: "+(typed.isEmpty()?"—":typed));
        next.setVisibility(View.VISIBLE);
        if(clean)after(1100,this::nextTask);
    }
    private void hideKeyboard(){
        InputMethodManager manager=(InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);
        if(manager!=null)manager.hideSoftInputFromWindow(entry.getWindowToken(),0);
    }
    private void done(){
        cancel();task=null;refresh();question.setText("✓");
        feedback.setText("Тренировка завершена."+
          "\nВерных с первого раза: "+correct+"/"+DailyTraining.TOTAL+
          "\nОшибок и ответов после подсказки: "+errors+
          "\nПовторных прослушиваний: "+replays+
          "\nВозвращайся завтра: интервальные повторения учитываются по датам.");
        entry.setVisibility(View.GONE);listen.setVisibility(View.GONE);
        submit.setVisibility(View.GONE);skip.setVisibility(View.GONE);
        next.setText("Начать серию снова");next.setVisibility(View.VISIBLE);
        next.setOnClickListener(v->{
            index=0;correct=0;errors=0;replays=0;
            entry.setVisibility(View.VISIBLE);submit.setVisibility(View.VISIBLE);
            skip.setVisibility(View.VISIBLE);
            next.setOnClickListener(w->nextTask());persist();nextTask();
        });
    }
    @Override public void onPause(){if(audio!=null)cancel();super.onPause();}
    @Override public void onDestroy(){if(audio!=null)cancel();super.onDestroy();}
}
