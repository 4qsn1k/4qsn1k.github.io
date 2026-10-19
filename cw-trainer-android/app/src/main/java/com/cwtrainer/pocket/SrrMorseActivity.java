package com.cwtrainer.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;
import java.util.Random;

/** Audio exam is continuous. No pause/replay/answer reveal until playback completes. */
public final class SrrMorseActivity extends Activity {
    private static final int BG=Color.rgb(12,24,35),PANEL=Color.rgb(30,46,61);
    private static final int GREEN=Color.rgb(31,137,118),WHITE=Color.WHITE,MUTED=Color.rgb(184,198,210);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Random random=new Random();
    private MorseTonePlayer audio;
    private SharedPreferences prefs;
    private boolean exam,preparing=false,playing=false,completed=false;
    private int length=25,cpm=30,epoch=0;
    private long startedAt=0,playedForMs=0;
    private String reference="";
    private TextView header,status,audioStatus,timer,result;
    private Button start,abort,grade,rate,lengthControl,way;
    private EditText transcribed;
    private ScrollView scroller;
    private final Runnable watch=new Runnable(){
        @Override public void run(){
            if(playing && timer!=null){
                long expected=CwExamAudio.durationMillis(reference,cpm);
                long remains=Math.max(0,expected-(SystemClock.elapsedRealtime()-startedAt));
                timer.setText("СИГНАЛ: "+(remains/60000)+":"+String.format(Locale.ROOT,"%02d",(remains/1000)%60));
                handler.postDelayed(this,1000);
            }
        }
    };
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size,int color){
        TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
        return t;
    }
    private Button button(String value,int color){
        Button b=new Button(this);b.setText(value);b.setTextColor(WHITE);b.setTextSize(17);
        b.setAllCaps(false);b.setMinHeight(dp(52));
        b.setBackgroundTintList(ColorStateList.valueOf(color));return b;
    }
    private LinearLayout root;
    private void add(View view,int top){
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
        lp.setMargins(0,dp(top),0,0);root.addView(view,lp);
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        exam=getIntent().getBooleanExtra("exam",false);
        if(exam){length=250;cpm=60;}
        prefs=getSharedPreferences("srr_exam_results",Context.MODE_PRIVATE);
        audio=new MorseTonePlayer(this,message->{
            if(audioStatus!=null)audioStatus.setText("Звук: "+message);
            if(!preparing && !playing)return;
            if(message.startsWith("Воспроизведение") && message.contains("запущено")){
                preparing=false;playing=true;startedAt=SystemClock.elapsedRealtime();
                status.setText("Приём начался. Не останавливай воспроизведение.");
                handler.removeCallbacks(watch);handler.post(watch);
            }else if(message.startsWith("Сигнал завершён")){
                preparing=false;playing=false;completed=true;
                playedForMs=SystemClock.elapsedRealtime()-startedAt;
                handler.removeCallbacks(watch);
                timer.setText("Сигнал окончен · введи принятую радиограмму");
                status.setText("Запиши результат и нажми «Проверить». Исходный текст пока скрыт.");
                abort.setVisibility(View.GONE);grade.setVisibility(View.VISIBLE);grade.setEnabled(true);
                start.setEnabled(false);rate.setEnabled(false);lengthControl.setEnabled(false);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }else if(message.startsWith("ОШИБКА")){
                stopExam(false);
                status.setText("Ошибка звука. Попробуй резервный режим AudioTrack.");
            }
        });
        build();
        resetUI();
    }
    private void build(){
        scroller=new ScrollView(this);scroller.setFillViewport(true);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14),dp(18),dp(14),dp(22));root.setBackgroundColor(BG);
        scroller.addView(root);setContentView(scroller);
        header=text(exam?"МОРЗЕ · ЭКЗАМЕН 1-Й КАТЕГОРИИ":"МОРЗЕ · ТРЕНИРОВКА ПРИЁМА",
            21,Color.rgb(122,228,194));header.setGravity(Gravity.CENTER);add(header,0);
        add(text(exam?"250 знаков · 60 зн/мин · не более 3 ошибок":
                 "Несмысловые группы из пяти знаков без подсказок и остановок",15,MUTED),7);
        lengthControl=button("",PANEL);add(lengthControl,13);
        lengthControl.setOnClickListener(v->{
            int[] lengths={25,50,100,250};int next=0;
            for(int i=0;i<lengths.length;i++)if(lengths[i]==length){next=(i+1)%lengths.length;break;}
            length=lengths[next];refreshOptions();
        });
        rate=button("",PANEL);add(rate,4);
        rate.setOnClickListener(v->{
            int[] rates={30,40,50,60,70,80};int next=0;
            for(int i=0;i<rates.length;i++)if(rates[i]==cpm){next=(i+1)%rates.length;break;}
            cpm=rates[next];refreshOptions();
        });
        start=button("▶ НАЧАТЬ ПРИЁМ",GREEN);add(start,14);
        start.setOnClickListener(v->startExam());
        abort=button("Прервать (попытка не зачтётся)",PANEL);add(abort,6);
        abort.setOnClickListener(v->stopExam(true));
        timer=text("",18,WHITE);timer.setGravity(Gravity.CENTER);add(timer,10);
        status=text("",15,MUTED);add(status,8);
        transcribed=new EditText(this);
        transcribed.setTextColor(WHITE);transcribed.setHintTextColor(MUTED);
        transcribed.setTextSize(20);transcribed.setMinLines(4);
        transcribed.setHint("Включи РУССКУЮ раскладку. Записывай буквы и цифры во время приёма либо перенеси с бумаги после сигнала.");
        transcribed.setInputType(android.text.InputType.TYPE_CLASS_TEXT|
            android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS|
            android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        transcribed.setPadding(dp(12),dp(12),dp(12),dp(12));
        add(transcribed,12);
        grade=button("Проверить радиограмму",GREEN);add(grade,8);
        grade.setOnClickListener(v->grade());
        result=text("",15,WHITE);add(result,12);
        audioStatus=text("",12,MUTED);add(audioStatus,12);
        way=button("Резервный звук: AudioTrack / WAV",PANEL);add(way,5);
        way.setOnClickListener(v->{
            if(playing||preparing)return;
            audio.setUseStream(!audio.usesStream());
            audioStatus.setText("Выбран "+(audio.usesStream()?"AudioTrack":"WAV"));
        });
        Button back=button("← Назад",PANEL);add(back,18);
        back.setOnClickListener(v->finish());
    }
    private void refreshOptions(){
        lengthControl.setText("Объём: "+length+" знаков"+(exam?" (экзамен)":" · изменить"));
        rate.setText("Скорость: "+cpm+" знаков/мин"+(exam?" (экзамен)":" · изменить"));
        lengthControl.setEnabled(!exam && !preparing && !playing && !completed);
        rate.setEnabled(!exam && !preparing && !playing && !completed);
    }
    private void resetUI(){
        preparing=false;playing=false;completed=false;reference="";
        refreshOptions();start.setEnabled(true);
        abort.setVisibility(View.GONE);grade.setVisibility(View.GONE);
        transcribed.setEnabled(false);
        status.setText("Нажми «НАЧАТЬ ПРИЁМ». Сигнал будет воспроизведён один раз.");
        timer.setText("Длительность: "+((long)length*60/cpm)+" секунд");
        result.setText("");audioStatus.setText("Аудио: WAV, 650 Гц");
    }
    private void startExam(){
        if(preparing||playing)return;
        audio.stop();handler.removeCallbacks(watch);
        epoch++;reference=SrrExamEngine.randomRadiogram(random,length);
        preparing=true;playing=false;completed=false;startedAt=0;playedForMs=0;
        start.setEnabled(false);rate.setEnabled(false);lengthControl.setEnabled(false);
        abort.setVisibility(View.VISIBLE);grade.setVisibility(View.GONE);
        transcribed.setEnabled(true);transcribed.setText("");
        status.setText("Подготовка аудио. Подожди начала воспроизведения.");
        timer.setText("Длительность "+CwExamAudio.durationMillis(reference,cpm)/1000+" секунд");
        result.setText("");getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        audio.playExamText(reference,cpm);
    }
    private void stopExam(boolean manual){
        handler.removeCallbacks(watch);audio.stop();
        preparing=false;playing=false;completed=false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        start.setEnabled(true);abort.setVisibility(View.GONE);grade.setVisibility(View.GONE);
        transcribed.setEnabled(false);
        if(manual){result.setText("Попытка прервана. Результат не засчитывается.");reference="";}
        refreshOptions();
    }
    private void grade(){
        if(!completed || reference.isEmpty())return;
        completed=false;
        // Only the audio run belongs to the 60-character/minute test.
        // Entering a handwritten answer AFTER the signal must not count as extra playback time.
        long elapsed=playedForMs>0?playedForMs:Long.MAX_VALUE;
        int mistakes=exam?SrrExamEngine.errors(reference,transcribed.getText().toString()):
                          SrrExamEngine.errorsAny(reference,transcribed.getText().toString());
        boolean pass=exam?SrrExamEngine.morsePassed(mistakes,elapsed):
                          mistakes<=Math.max(1,(int)Math.floor(length*.012));
        String oldHistory=prefs.getString("completed_history_v1","");
        // Every COMPLETED reception task, including failed tasks, contributes to the record.
        // Aborted or interrupted audio is excluded.
        String newHistory=TrainingOutcomeHistory.append(oldHistory,
            new TrainingOutcomeHistory.Record(TrainingOutcomeHistory.Part.MORSE,
                System.currentTimeMillis(),Math.max(0,length-mistakes),length,cpm,
                Math.max(1,elapsed==Long.MAX_VALUE?CwExamAudio.durationMillis(reference,cpm):elapsed)));
        prefs.edit().putString("completed_history_v1",newHistory).apply();
        result.setText((pass?"✓ ЗАЧЁТ":"✕ НЕЗАЧЁТ")+"\n"+
            "Ошибок (замены, пропуски, вставки): "+mistakes+
            "\nПолучено знаков: "+SrrExamEngine.normalize(transcribed.getText().toString()).length()+
            "/"+length+"\nСкорость: "+cpm+" зн/мин"+
            "\nДлительность звука: "+(elapsed/1000)+" с"+
            "\n\nИсходный текст:\n"+reference+
            "\n\nТвоя запись:\n"+transcribed.getText().toString().trim().toUpperCase(Locale.ROOT));
        if(exam){
            prefs.edit().putInt("morse_errors",mistakes)
                .putBoolean("morse_pass",pass)
                .putLong("morse_date",System.currentTimeMillis()).apply();
        }
        transcribed.setEnabled(false);grade.setVisibility(View.GONE);
        abort.setVisibility(View.GONE);start.setText("▶ НОВАЯ РАДИОГРАММА");
        start.setEnabled(true);preparing=false;playing=false;
        refreshOptions();
        scroller.post(()->scroller.fullScroll(View.FOCUS_DOWN));
    }
    @Override public void onPause(){
        if(playing||preparing)stopExam(true);
        handler.removeCallbacks(watch);super.onPause();
    }
    @Override public void onDestroy(){audio.stop();handler.removeCallbacks(watch);super.onDestroy();}
}
