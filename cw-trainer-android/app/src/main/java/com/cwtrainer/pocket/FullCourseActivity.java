package com.cwtrainer.pocket;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputFilter;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * 16-session independent study companion to CW Academy Beginner.
 * Not the original CW Academy curriculum, not a substitute for advisor/on-air practice.
 */
public final class FullCourseActivity extends Activity {
    private enum Screen { OVERVIEW, INTRO, PRACTICE, CHECK, SEND }
    private static final int BG=Color.rgb(12,24,35), PANEL=Color.rgb(30,46,61);
    private static final int HIGHLIGHT=Color.rgb(32,122,111), DANGER=Color.rgb(160,65,66);
    private static final int WHITE=Color.WHITE, MUTED=Color.rgb(181,198,210);
    private SharedPreferences prefs;
    private CwCourseState state;
    private MorseTonePlayer audio;
    private final Random random=new Random();
    private final Handler main=new Handler(Looper.getMainLooper());
    private Runnable pending=null;
    private int taskEpoch=0, replayCount=0, charWpm=25, effectiveWpm=6;
    private Screen screen=Screen.OVERVIEW;
    private boolean answered=false;
    private String expected="",sendExpected="",sendPattern="",sendDurations="";
    private CwCoursePlan.Kind kind=CwCoursePlan.Kind.CHARACTER;
    private LinearLayout root,section,sessionButtons,examActions;
    private TextView title,subtitle,hero,status,soundStatus,progress;
    private Button replay,next,submit,unknown,kindButton;
    private EditText answerInput;

    private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
    private GradientDrawable bg(int color){
        GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(12));return d;
    }
    private TextView label(String text,int size,int color){
        TextView t=new TextView(this);t.setText(text);t.setTextSize(size);t.setTextColor(color);
        t.setGravity(Gravity.CENTER);return t;
    }
    private Button button(String text,int color){
        Button b=new Button(this);b.setText(text);b.setTextSize(16);
        b.setAllCaps(false);b.setTextColor(WHITE);
        b.setBackgroundTintList(ColorStateList.valueOf(color));b.setMinHeight(dp(50));return b;
    }
    private void add(LinearLayout to,View v,int margin){
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
        lp.setMargins(0,dp(margin),0,0);to.addView(v,lp);
    }
    private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout row(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);return l;}
    private void pair(LinearLayout to,View v){
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);
        p.setMargins(dp(3),dp(3),dp(3),0);to.addView(v,p);
    }
    private void uiMessage(String value){status.setText(value);}
    private void persist(){
        prefs.edit().putString("course_state",state.save()).putInt("charWpm",charWpm)
            .putInt("effectiveWpm",effectiveWpm).apply();
    }
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        prefs=getSharedPreferences("cw_complete_course",Context.MODE_PRIVATE);
        state=CwCourseState.load(prefs.getString("course_state",""));
        charWpm=prefs.getInt("charWpm",25);
        effectiveWpm=prefs.getInt("effectiveWpm",6);
        audio=new MorseTonePlayer(this, update -> {
            if(soundStatus!=null)soundStatus.setText("Аудио: "+update);
        });
        build();overview();
    }
    private void build(){
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        root=column();root.setBackgroundColor(BG);root.setPadding(dp(12),dp(15),dp(12),dp(22));
        scroll.addView(root);setContentView(scroll);
        title=label("CW TRAINER · 16 ЗАНЯТИЙ",20,Color.rgb(121,231,205));
        title.setTypeface(null,Typeface.BOLD);add(root,title,0);
        subtitle=label("",13,MUTED);add(root,subtitle,7);
        LinearLayout tabs=row();add(root,tabs,8);
        Button overviewButton=button("16 занятий",PANEL);pair(tabs,overviewButton);
        overviewButton.setOnClickListener(v->overview());
        Button introButton=button("Знакомство",PANEL);pair(tabs,introButton);
        introButton.setOnClickListener(v->intro());
        Button examButton=button("Контроль",HIGHLIGHT);pair(tabs,examButton);
        examButton.setOnClickListener(v->exercise(Screen.CHECK));
        LinearLayout tabs2=row();add(root,tabs2,2);
        Button practiceButton=button("Тренировка",PANEL);pair(tabs2,practiceButton);
        practiceButton.setOnClickListener(v->exercise(Screen.PRACTICE));
        Button sendButton=button("Передача",PANEL);pair(tabs2,sendButton);
        sendButton.setOnClickListener(v->sending());
        Button home=button("← Основной экран",PANEL);pair(tabs2,home);
        home.setOnClickListener(v->finish());
        LinearLayout speeds=row();add(root,speeds,7);
        Button chars=button("",PANEL);pair(speeds,chars);
        Button effective=button("",PANEL);pair(speeds,effective);
        chars.setText("Символ: "+charWpm+" WPM");
        effective.setText("Темп: "+effectiveWpm+" WPM");
        chars.setOnClickListener(v->{
            int[] values={15,18,20,25,30};
            int next=0;for(int i=0;i<values.length;i++)if(values[i]==charWpm){next=(i+1)%values.length;break;}
            charWpm=values[next];effectiveWpm=Math.min(effectiveWpm,charWpm);
            chars.setText("Символ: "+charWpm+" WPM");effective.setText("Темп: "+effectiveWpm+" WPM");
            persist();if(screen==Screen.CHECK||screen==Screen.PRACTICE)nextTask();
        });
        effective.setOnClickListener(v->{
            int[] values={4,6,8,10,12,15,20,25,30};
            for(int i=0;i<values.length;i++)if(values[i]==effectiveWpm){
                effectiveWpm=values[(i+1)%values.length];break;
            }
            effectiveWpm=Math.min(effectiveWpm,charWpm);
            effective.setText("Темп: "+effectiveWpm+" WPM");
            persist();if(screen==Screen.CHECK||screen==Screen.PRACTICE)nextTask();
        });
        progress=label("",14,MUTED);add(root,progress,9);
        hero=label("",46,WHITE);hero.setTypeface(null,Typeface.BOLD);
        hero.setBackground(bg(PANEL));
        LinearLayout.LayoutParams h=new LinearLayout.LayoutParams(-1,dp(130));
        h.setMargins(0,dp(12),0,0);root.addView(hero,h);
        status=label("",15,MUTED);add(root,status,8);
        section=column();add(root,section,7);
        sessionButtons=column();add(section,sessionButtons,3);
        examActions=column();add(section,examActions,3);
        answerInput=new EditText(this);
        answerInput.setSingleLine(false);answerInput.setMinLines(1);answerInput.setMaxLines(3);
        answerInput.setTextSize(23);answerInput.setTextColor(WHITE);answerInput.setHintTextColor(MUTED);
        answerInput.setHint("Запиши услышанное");
        answerInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS |
            android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        answerInput.setBackground(bg(PANEL));answerInput.setPadding(dp(13),dp(10),dp(13),dp(10));
        add(examActions,answerInput,3);
        LinearLayout actions=row();add(examActions,actions,5);
        submit=button("Проверить",HIGHLIGHT);pair(actions,submit);
        submit.setOnClickListener(v->submitAnswer(false));
        unknown=button("Не знаю",PANEL);pair(actions,unknown);
        unknown.setOnClickListener(v->submitAnswer(true));
        kindButton=button("",PANEL);add(examActions,kindButton,5);
        kindButton.setOnClickListener(v->{if(screen==Screen.PRACTICE)nextKind();});
        replay=button("▶ Слушать снова",PANEL);add(root,replay,10);
        replay.setOnClickListener(v->{
            if(screen!=Screen.CHECK && screen!=Screen.PRACTICE)return;
            if(!answered)replayCount++;
            audio.playText(expected,charWpm,effectiveWpm);
        });
        next=button("Далее",PANEL);add(root,next,5);
        next.setOnClickListener(v->nextTask());
        soundStatus=label("Аудио: ожидание",12,MUTED);add(root,soundStatus,10);
        Button sos=button("🔊 Проверка SOS / смена способа звука",PANEL);
        add(root,sos,5);sos.setOnClickListener(v->{
            audio.setUseStream(!audio.usesStream());
            audio.playText("SOS",charWpm,effectiveWpm);
        });
        TextView note=label(
           "Адаптация CW Academy Beginner (2025). Контроль приложения — не сертификат. Для полноценной передачи и выхода в эфир нужна практика с ключом и оператором.",
            12,MUTED);add(root,note,14);
    }
    private void cancel(){
        taskEpoch++;
        if(pending!=null)main.removeCallbacks(pending);
        pending=null;audio.stop();
    }
    private void later(Runnable cb,long delay) {
        int expectedEpoch=taskEpoch;
        pending=()->{if(taskEpoch==expectedEpoch)cb.run();};
        main.postDelayed(pending,delay);
    }
    private void common(Screen target){
        cancel();screen=target;section.removeAllViews();
        if(progress!=null)progress.setText("Занятие "+state.selected+" из 16 — "+CwCoursePlan.TITLES[state.selected-1]+
          "\nДоступно занятий: "+state.unlocked+
          " · Контроль: "+state.attempts[state.selected-1]+
          " · Точность "+state.accuracy(state.selected)+"%");
        hero.setText("?");hero.setTextSize(46);
        status.setTextColor(MUTED);replay.setVisibility(View.GONE);next.setVisibility(View.GONE);
    }
    private void overview() {
        common(Screen.OVERVIEW);
        hero.setText(state.unlocked+" / 16");status.setText("Выбери занятие. Следующие открываются после контрольной работы.");
        TextView summary=label("Практика: "+state.daysPracticed+" дней.\nСодержание 1–10: знаки, слова и группы.\n11–13: сообщения и QSO.\n14–16: подготовка к эфиру.",15,MUTED);
        add(section,summary,4);
        for(int s=1;s<=16;s++){
            final int n=s;
            Button b=button(String.format(Locale.ROOT,"%02d · %s%s",s,CwCoursePlan.TITLES[s-1],s>state.unlocked?" 🔒":""),s==state.selected?HIGHLIGHT:PANEL);
            b.setTextSize(14);b.setEnabled(s<=state.unlocked);
            add(section,b,3);b.setOnClickListener(v->{
                state.selected=n;persist();intro();
            });
        }
    }
    private void intro(){
        common(Screen.INTRO);
        List<String> newItems=CwCoursePlan.newSymbols(state.selected);
        if(newItems.isEmpty()){
            hero.setText("QSO");
            status.setText("Новых символов нет. Повторяй группы, позывные и сообщения.");
        }else{
            hero.setText("▶");
            status.setText("Нажми символ и прослушай его целиком. Затем переходи к тренировке.");
            for(String key:newItems){
                Button b=button(key+"    "+CwCoursePlan.code(key),PANEL);add(section,b,5);
                b.setOnClickListener(v->{
                    hero.setText(key);hero.setTextSize(44);
                    audio.play(CwCoursePlan.code(key),charWpm);
                });
            }
        }
        Button practice=button("Перейти к тренировке",HIGHLIGHT);add(section,practice,14);
        practice.setOnClickListener(v->exercise(Screen.PRACTICE));
    }
    private String kindLabel(CwCoursePlan.Kind k){
        switch(k){
            case CHARACTER:return "Буквы и знаки";
            case GROUP:return "Группы из 3–5 знаков";
            case WORD:return "Слова";
            case ABBREVIATION:return "Сокращения и Q-коды";
            case CALLSIGN:return "Позывные";
            case MESSAGE:return "Фразы и QSO";
            default:return "Передача";
        }
    }
    private void exercise(Screen type){
        common(type);
        section.addView(examActions);
        replay.setVisibility(View.VISIBLE);
        if(type==Screen.CHECK) {
            status.setText("Без подсказок. Запиши весь сигнал. Не копируй точки и тире.");
            kindButton.setEnabled(false);
        } else {
            status.setText("Тренировка. Правильность показывается, но этап не открывает.");
            kindButton.setEnabled(true);
        }
        nextTask();
    }
    private final CwCoursePlan.Kind[] KINDS={
        CwCoursePlan.Kind.CHARACTER,CwCoursePlan.Kind.GROUP,
        CwCoursePlan.Kind.WORD,CwCoursePlan.Kind.ABBREVIATION,
        CwCoursePlan.Kind.CALLSIGN,CwCoursePlan.Kind.MESSAGE
    };
    private void nextKind(){
        for(int i=0;i<KINDS.length;i++)if(KINDS[i]==kind){
            for(int d=1;d<=KINDS.length;d++){
                CwCoursePlan.Kind nextType=KINDS[(i+d)%KINDS.length];
                if(nextType==CwCoursePlan.Kind.GROUP ||
                   !CwCoursePlan.exercises(state.selected,nextType).isEmpty()){
                    kind=nextType;break;
                }
            }break;
        }
        nextTask();
    }
    private CwCoursePlan.Kind examKind(){
        int i=state.selected-1;
        if(state.selected<=10){
            if(state.kindAttempts[i][CwCoursePlan.Kind.CHARACTER.ordinal()]<8)return CwCoursePlan.Kind.CHARACTER;
            if(state.kindAttempts[i][CwCoursePlan.Kind.GROUP.ordinal()]<8)return CwCoursePlan.Kind.GROUP;
            if(state.kindAttempts[i][CwCoursePlan.Kind.WORD.ordinal()]<6)return CwCoursePlan.Kind.WORD;
            if(state.selected>=2 &&
               state.kindAttempts[i][CwCoursePlan.Kind.CALLSIGN.ordinal()]<3)return CwCoursePlan.Kind.CALLSIGN;
        }else{
            if(state.kindAttempts[i][CwCoursePlan.Kind.MESSAGE.ordinal()]<8)return CwCoursePlan.Kind.MESSAGE;
            if(state.kindAttempts[i][CwCoursePlan.Kind.CALLSIGN.ordinal()]<6)return CwCoursePlan.Kind.CALLSIGN;
            if(state.kindAttempts[i][CwCoursePlan.Kind.GROUP.ordinal()]<6)return CwCoursePlan.Kind.GROUP;
        }
        return KINDS[random.nextInt(KINDS.length)];
    }
    private void nextTask(){
        if(screen!=Screen.PRACTICE && screen!=Screen.CHECK)return;
        cancel();replayCount=0;answered=false;
        if(screen==Screen.CHECK)kind=examKind();
        if(kind!=CwCoursePlan.Kind.GROUP &&
           CwCoursePlan.exercises(state.selected,kind).isEmpty())kind=CwCoursePlan.Kind.GROUP;
        expected=CwCoursePlan.next(state.selected,kind,random);
        hero.setText("?");hero.setTextSize(52);
        status.setText("Слушай и напиши ответ. Тип: "+kindLabel(kind));
        status.setTextColor(MUTED);kindButton.setText("Тип задания: "+kindLabel(kind)+
            (screen==Screen.PRACTICE?" · изменить":""));
        answerInput.setText("");answerInput.setEnabled(true);
        submit.setEnabled(true);unknown.setEnabled(true);
        next.setVisibility(View.GONE);
        progress.setText("Занятие "+state.selected+" / 16 · "+CwCoursePlan.TITLES[state.selected-1]+
          "\nПопыток "+state.attempts[state.selected-1]+
          " · Верно "+state.accuracy(state.selected)+"% · Темп "+charWpm+"/"+effectiveWpm+" WPM");
        later(()->audio.playText(expected,charWpm,effectiveWpm),600);
    }
    private void hideKeyboard(){
        InputMethodManager keyboard=(InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);
        if(keyboard!=null)keyboard.hideSoftInputFromWindow(answerInput.getWindowToken(),0);
    }
    private static String normalized(String text) {
        return text.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+"," ");
    }
    private void submitAnswer(boolean unknown){
        if(answered || screen!=Screen.CHECK && screen!=Screen.PRACTICE)return;
        String response=normalized(answerInput.getText().toString());
        if(!unknown && response.isEmpty()){uiMessage("Введи ответ или нажми «Не знаю»");return;}
        boolean right=!unknown && response.equals(normalized(expected));
        boolean independent=right && replayCount==0;
        answered=true;cancel();hideKeyboard();
        if(screen==Screen.CHECK){
            state.grade(state.selected,kind,independent,System.currentTimeMillis());
            persist();
        }
        answerInput.setEnabled(false);submit.setEnabled(false);unknown.setEnabled(false);
        hero.setText(expected);hero.setTextSize(expected.length()>18?19:expected.length()>6?28:48);
        status.setText((right?"✓ Правильно":"✕ Ошибка")+
            (right&&replayCount>0?" · после повтора (не зачтено)":"")+
            "\nПравильный ответ: "+expected);
        status.setTextColor(right?Color.rgb(139,229,171):Color.rgb(255,151,143));
        progress.setText("Занятие "+state.selected+" / 16 · контроль "+state.attempts[state.selected-1]+
           " ответов, "+state.accuracy(state.selected)+"%"+
           (state.passed(state.selected)?" · этап пройден":"")+
           (state.unlocked>state.selected?" · следующее занятие открыто":""));
        if(right){later(()->nextTask(),1300);}
        else{next.setVisibility(View.VISIBLE);audio.playText(expected,charWpm,effectiveWpm);}
    }
    private void sending(){
        common(Screen.SEND);
        status.setText("Передача прямым экранным ключом. Нажми и удерживай кнопку; короткое нажатие — точка, длинное — тире.");
        sendExpected=CwCoursePlan.next(state.selected,CwCoursePlan.Kind.CHARACTER,random);
        hero.setText(sendExpected);hero.setTextSize(64);
        sendPattern="";sendDurations="";
        TextView decoded=label("",18,MUTED);add(section,decoded,6);
        Button key=button("●  УДЕРЖИВАТЬ ТЕЛЕГРАФНЫЙ КЛЮЧ",HIGHLIGHT);add(section,key,10);
        long[] down={0};
        key.setOnTouchListener((v,e)->{
            if(e.getAction()==MotionEvent.ACTION_DOWN){
                down[0]=SystemClock.elapsedRealtime();key.setText("●  ПЕРЕДАЧА...");
                return true;
            }
            if(e.getAction()==MotionEvent.ACTION_UP){
                key.setText("●  УДЕРЖИВАТЬ ТЕЛЕГРАФНЫЙ КЛЮЧ");
                if(down[0]>0){
                    long ms=SystemClock.elapsedRealtime()-down[0];down[0]=0;
                    long threshold=120;  // only an entry-level estimate, not graded sending timing
                    String element=ms<threshold?".":"-";
                    sendPattern+=element;sendDurations+=ms+"мс ";
                    decoded.setText("Передано: "+sendPattern+"\nНажатия: "+sendDurations);
                    audio.play(element,charWpm);
                }
                return true;
            }
            if(e.getAction()==MotionEvent.ACTION_CANCEL){
                key.setText("●  УДЕРЖИВАТЬ ТЕЛЕГРАФНЫЙ КЛЮЧ");down[0]=0;return true;
            }
            return true;
        });
        LinearLayout row=row();add(section,row,5);
        Button clear=button("Очистить",PANEL);pair(row,clear);
        clear.setOnClickListener(v->{sendPattern="";sendDurations="";decoded.setText("");});
        Button grade=button("Проверить знак",HIGHLIGHT);pair(row,grade);
        grade.setOnClickListener(v->{
            String expectedCode=CwCoursePlan.code(sendExpected);
            status.setText((sendPattern.equals(expectedCode)?"✓ Знак передан верно":"✕ Сигнал не совпадает")+
                "\nОжидалось: "+sendExpected+" ("+expectedCode+")"+
                "\nТы передал: "+sendPattern+
                "\nЭто практика элементов. Интервалы пока не оцениваются.");
        });
        Button nextSymbol=button("Следующий символ",PANEL);add(section,nextSymbol,7);
        nextSymbol.setOnClickListener(v->sending());
        TextView limit=label("Настоящий ключ и оценка длительности пауз нужны для полноценной проверки передачи. Здесь оценивается только последовательность точек и тире.",13,MUTED);
        add(section,limit,10);
    }
    @Override public void onPause(){cancel();super.onPause();}
    @Override public void onDestroy(){cancel();super.onDestroy();}
}
