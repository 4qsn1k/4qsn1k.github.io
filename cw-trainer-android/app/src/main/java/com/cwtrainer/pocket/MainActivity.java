package com.cwtrainer.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.EditorInfo;
import android.text.InputFilter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/** Native, offline, beginner CW course. */
public final class MainActivity extends Activity {
    enum Mode { LEARN, CHOICE, CONTROL, STATS }
    private static final int BACKGROUND=Color.rgb(12,24,35);
    private static final int PANEL=Color.rgb(30,46,61);
    private static final int GREEN=Color.rgb(34,135,117);
    private static final int RED=Color.rgb(171,61,68);
    private static final int WHITE=Color.WHITE;
    private static final int MUTED=Color.rgb(178,195,209);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Random random=new Random();
    private MorseTonePlayer audio;
    private SharedPreferences prefs;
    private List<MorseCourse.Symbol> alphabet;
    private MorseCourse.Progress progress;
    private boolean russian=false;
    private Mode mode=Mode.LEARN;
    private int question=-1;
    private boolean answered=false;
    private int repeats=0;
    private int questionVersion=0;
    private LinearLayout root, learnPanel, choicesPanel, controlPanel, statPanel;
    private TextView heading, prompt, character, feedback, metrics, stats;
    private EditText answerField;
    private Button languageButton, replayButton, nextButton, submitButton, unknownButton;
    private Button soundTestButton, audioModeButton;
    private TextView soundStatus;
    private final Button[] choiceButtons=new Button[4];
    private final Button[] modeButtons=new Button[4];
    private Runnable scheduled=null;

    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private GradientDrawable rounded(int color,int radius) {
        GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;
    }
    private TextView text(String value,int size,int color) {
        TextView v=new TextView(this);
        v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER);
        return v;
    }
    private Button button(String value,int color) {
        Button b=new Button(this);b.setText(value);b.setTextSize(17);b.setTextColor(WHITE);
        b.setAllCaps(false);b.setBackgroundTintList(ColorStateList.valueOf(color));
        b.setMinHeight(dp(52));return b;
    }
    private void tint(Button b,int color){b.setBackgroundTintList(ColorStateList.valueOf(color));}
    private LinearLayout column() {
        LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);return c;
    }
    private void add(LinearLayout parent,View v,int margin) {
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,dp(margin),0,0);parent.addView(v,p);
    }
    private LinearLayout row() {
        LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.HORIZONTAL);return r;
    }
    private void half(LinearLayout parent,View v) {
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);
        p.setMargins(dp(3),dp(4),dp(3),0);parent.addView(v,p);
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        audio=new MorseTonePlayer(this, message -> {
            if(soundStatus!=null)soundStatus.setText("Звук: "+message+"\n"+volumeInfo());
        });
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        prefs=getSharedPreferences("cw_trainer_pocket",Context.MODE_PRIVATE);
        russian=prefs.getBoolean("russian",false);
        loadLanguage();
        buildUI();
        switchMode(Mode.LEARN);
    }
    private void loadLanguage() {
        alphabet=MorseCourse.alphabet(russian);
        progress=MorseCourse.Progress.parse(prefs.getString(russian?"progress_ru":"progress_en",""),alphabet.size());
    }
    private void saveProgress(){
        prefs.edit().putString(russian?"progress_ru":"progress_en",progress.serialize()).apply();
    }
    private String volumeInfo(){
        AudioManager a=(AudioManager)getSystemService(Context.AUDIO_SERVICE);
        if(a==null)return "Не удалось получить громкость";
        int v=a.getStreamVolume(AudioManager.STREAM_MUSIC);
        int max=a.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        return "Громкость медиа: "+v+"/"+max+(v==0?" — УВЕЛИЧЬ ГРОМКОСТЬ!":"")+". Проверяй аудиовыход телефона.";
    }
    private void buildUI(){
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        root=column();root.setPadding(dp(14),dp(14),dp(14),dp(20));
        root.setBackgroundColor(BACKGROUND);scroll.addView(root);setContentView(scroll);

        TextView name=text("CW  TRAINER  POCKET",21,Color.rgb(125,234,202));
        name.setTypeface(null,Typeface.BOLD);add(root,name,2);
        languageButton=button("",PANEL);languageButton.setTextSize(15);
        add(root,languageButton,6);
        soundTestButton=button("🔊  ПРОВЕРИТЬ ЗВУК (SOS)",GREEN);
        add(root,soundTestButton,7);
        soundTestButton.setOnClickListener(v->{audio.play("...---...",25);});
        audioModeButton=button("Способ звука: WAV · сменить",PANEL);
        audioModeButton.setTextSize(14);
        add(root,audioModeButton,4);
        audioModeButton.setOnClickListener(v->{
            audio.setUseStream(!audio.usesStream());
            audioModeButton.setText(audio.usesStream()?"Способ звука: AudioTrack · сменить":"Способ звука: WAV · сменить");
            audio.play("...---...",25);
        });
        soundStatus=text(volumeInfo(),13,MUTED);soundStatus.setGravity(Gravity.START);
        add(root,soundStatus,5);
        languageButton.setOnClickListener(v->{
            cancelPending();
            saveProgress();
            russian=!russian;prefs.edit().putBoolean("russian",russian).apply();
            loadLanguage();switchMode(Mode.LEARN);
        });
        String[] labels={"1. Знакомство","2. Тренировка","3. Контроль","4. Результат"};
        for(int r=0;r<2;r++){
            LinearLayout line=row();add(root,line,2);
            for(int c=0;c<2;c++){
                int index=r*2+c;
                Button b=button(labels[index],PANEL);b.setTextSize(14);
                half(line,b);modeButtons[index]=b;
                b.setOnClickListener(v->switchMode(Mode.values()[index]));
            }
        }
        heading=text("",16,MUTED);add(root,heading,12);
        prompt=text("",17,MUTED);add(root,prompt,4);
        character=text("?",74,WHITE);character.setTypeface(null,Typeface.BOLD);
        character.setBackground(rounded(PANEL,14));
        LinearLayout.LayoutParams hero=new LinearLayout.LayoutParams(-1,dp(140));
        hero.setMargins(0,dp(12),0,dp(8));root.addView(character,hero);
        feedback=text("",17,MUTED);add(root,feedback,5);
        metrics=text("",14,MUTED);add(root,metrics,5);

        learnPanel=column();add(root,learnPanel,8);
        choicesPanel=column();add(root,choicesPanel,8);
        for(int r=0;r<2;r++){
            LinearLayout line=row();add(choicesPanel,line,4);
            for(int c=0;c<2;c++){
                int index=r*2+c;
                Button b=button("?",GREEN);b.setTextSize(23);half(line,b);
                choiceButtons[index]=b;b.setOnClickListener(v->respondChoice(index));
            }
        }
        controlPanel=column();add(root,controlPanel,8);
        answerField=new EditText(this);
        answerField.setTextColor(WHITE);answerField.setHintTextColor(MUTED);
        answerField.setTextSize(26);answerField.setSingleLine(true);
        answerField.setHint("Введи одну букву");
        answerField.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1)});
        answerField.setImeOptions(EditorInfo.IME_ACTION_DONE);
        answerField.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
           android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        answerField.setBackground(rounded(PANEL,12));
        answerField.setPadding(dp(14),dp(8),dp(14),dp(8));add(controlPanel,answerField,2);
        answerField.setOnEditorActionListener((v,action,event)->{
            if(action==EditorInfo.IME_ACTION_DONE){respondBlind(false);return true;}
            return false;
        });
        LinearLayout controlActions=row();add(controlPanel,controlActions,6);
        submitButton=button("Проверить",GREEN);half(controlActions,submitButton);
        submitButton.setOnClickListener(v->respondBlind(false));
        unknownButton=button("Не знаю",PANEL);half(controlActions,unknownButton);
        unknownButton.setOnClickListener(v->respondBlind(true));

        statPanel=column();add(root,statPanel,8);
        stats=text("",17,WHITE);stats.setGravity(Gravity.START);
        stats.setPadding(dp(14),dp(12),dp(14),dp(12));stats.setBackground(rounded(PANEL,12));
        add(statPanel,stats,3);

        replayButton=button("▶  Слушать / повторить",PANEL);add(root,replayButton,12);
        replayButton.setOnClickListener(v->{
            if(question<0)return;
            if(mode==Mode.CONTROL && !answered)repeats++;
            audio.play(alphabet.get(question).code,25);
        });
        nextButton=button("Следующее задание",PANEL);add(root,nextButton,6);
        nextButton.setOnClickListener(v->newQuestion());

        TextView footer=text("25 WPM внутри символов · офлайн · звук 650 Гц",12,MUTED);
        add(root,footer,14);
    }
    private void cancelPending(){
        questionVersion++;
        if(scheduled!=null)handler.removeCallbacks(scheduled);
        scheduled=null;audio.stop();
    }
    private void schedule(Runnable action,long delay) {
        final int version=questionVersion;
        scheduled=()->{if(questionVersion==version)action.run();};
        handler.postDelayed(scheduled,delay);
    }
    private void switchMode(Mode next){
        cancelPending();mode=next;answered=false;
        for(int i=0;i<4;i++)tint(modeButtons[i],i==next.ordinal()?GREEN:PANEL);
        languageButton.setText(russian?"Язык: РУССКИЙ  ·  переключить":"Язык: МЕЖДУНАРОДНЫЙ  ·  переключить");
        learnPanel.setVisibility(next==Mode.LEARN?View.VISIBLE:View.GONE);
        choicesPanel.setVisibility(next==Mode.CHOICE?View.VISIBLE:View.GONE);
        controlPanel.setVisibility(next==Mode.CONTROL?View.VISIBLE:View.GONE);
        statPanel.setVisibility(next==Mode.STATS?View.VISIBLE:View.GONE);
        replayButton.setVisibility(next==Mode.STATS?View.GONE:View.VISIBLE);
        nextButton.setVisibility(View.GONE);
        refreshMetrics();
        if(next==Mode.STATS){
            question=-1;character.setText("✓");prompt.setText("Что уже освоено");
            feedback.setText("Прогресс считается только по контролю без вариантов");
            renderStats();return;
        }
        if(next==Mode.LEARN){
            question=Math.min(progress.unlocked-1,alphabet.size()-1);
            refreshIntroduction();
        }else newQuestion();
    }
    private void refreshMetrics(){
        int unlocked=Math.min(progress.unlocked,alphabet.size());
        heading.setText("Этап "+Math.max(1,unlocked-3)+"  ·  открыто "+unlocked+" / "+alphabet.size());
        metrics.setText("Контроль: "+progress.attempts+" попыток  ·  "+progress.accuracy()+"% без подсказок");
    }
    private void refreshIntroduction(){
        refreshMetrics();
        prompt.setText("Слушай целый сигнал. Не считай точки.");
        feedback.setText("Нажми на любую букву для прослушивания");
        character.setText(alphabet.get(question).label(russian)+"\n"+alphabet.get(question).code);
        character.setTextSize(40);
        learnPanel.removeAllViews();
        int start=Math.max(0,progress.unlocked-8);
        for(int i=start;i<progress.unlocked;i++){
            final int idx=i;MorseCourse.Symbol s=alphabet.get(i);
            Button b=button(s.label(russian)+"     "+s.code,i==progress.unlocked-1?GREEN:PANEL);
            add(learnPanel,b,2);
            b.setOnClickListener(v->{
                question=idx;
                character.setText(alphabet.get(question).label(russian)+"\n"+alphabet.get(question).code);
                audio.play(alphabet.get(question).code,25);
            });
        }
        if(start>0)feedback.setText("Последние 8 символов. Остальные повторяются в тренировках.");
        schedule(()->audio.play(alphabet.get(question).code,25),350);
    }
    private void newQuestion(){
        cancelPending();repeats=0;answered=false;nextButton.setVisibility(View.GONE);
        question=progress.choose(random,System.currentTimeMillis());
        refreshMetrics();character.setText("?");character.setTextSize(74);
        feedback.setText("");feedback.setTextColor(MUTED);
        if(mode==Mode.CHOICE){
            prompt.setText("Какой символ прозвучал? Выбери букву");
            ArrayList<Integer> options=new ArrayList<>();
            options.add(question);
            ArrayList<Integer> others=new ArrayList<>();
            for(int i=0;i<progress.unlocked;i++)if(i!=question)others.add(i);
            Collections.shuffle(others,random);
            for(int i=0;i<3 && i<others.size();i++)options.add(others.get(i));
            Collections.shuffle(options,random);
            for(int i=0;i<choiceButtons.length;i++){
                Button b=choiceButtons[i];
                if(i>=options.size()){
                    b.setVisibility(View.GONE);b.setEnabled(false);b.setTag(null);continue;
                }
                int value=options.get(i);
                b.setVisibility(View.VISIBLE);b.setTag(value);b.setEnabled(true);
                b.setText(alphabet.get(value).label(russian));tint(b,GREEN);
            }
        }else if(mode==Mode.CONTROL){
            prompt.setText("Контроль: введи букву без вариантов");
            answerField.setText("");answerField.setEnabled(true);
            submitButton.setEnabled(true);unknownButton.setEnabled(true);
            answerField.clearFocus();
        }else return;
        schedule(()->audio.play(alphabet.get(question).code,25),250);
    }
    private void respondChoice(int index){
        if(mode!=Mode.CHOICE || answered)return;
        if(index<0 || index>=choiceButtons.length)return;
        Button b=choiceButtons[index];Object tag=b.getTag();
        if(b.getVisibility()!=View.VISIBLE || !(tag instanceof Integer))return;
        int response=(Integer)tag;
        for(Button answer:choiceButtons) {
            Object id=answer.getTag();
            if(answer.getVisibility()!=View.VISIBLE || !(id instanceof Integer))continue;
            answer.setEnabled(false);int value=(Integer)id;
            tint(answer,value==question?GREEN:value==response?RED:PANEL);
        }
        finishAnswer(response==question,false);
    }
    private void respondBlind(boolean unknown){
        if(mode!=Mode.CONTROL || answered)return;
        String answer=answerField.getText().toString().trim().toUpperCase(Locale.ROOT);
        if(!unknown && answer.isEmpty()){
            feedback.setText("Введи одну букву или нажми «Не знаю»");return;
        }
        boolean correct=!unknown && answer.equals(alphabet.get(question).label(russian));
        answerField.setEnabled(false);submitButton.setEnabled(false);unknownButton.setEnabled(false);
        hideKeyboard();
        progress.record(question,correct,repeats>0,alphabet.size(),System.currentTimeMillis());
        saveProgress();
        finishAnswer(correct,true);
    }
    private void finishAnswer(boolean correct,boolean exam){
        answered=true;cancelPending();
        String label=alphabet.get(question).label(russian);
        character.setText(label+"\n"+alphabet.get(question).code);
        character.setTextSize(37);
        feedback.setText(correct?"✓ Верно"+(exam && repeats>0?" (после повтора)":"")
               :"✗ Правильная буква: "+label);
        feedback.setTextColor(correct?Color.rgb(124,228,175):Color.rgb(255,153,151));
        refreshMetrics();
        if(correct) {
            schedule(()->newQuestion(),1000);
        }else {
            nextButton.setVisibility(View.VISIBLE);
            audio.play(alphabet.get(question).code,25);
        }
    }
    private void hideKeyboard(){
        try{
            InputMethodManager im=(InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);
            if(im!=null)im.hideSoftInputFromWindow(answerField.getWindowToken(),0);
        }catch(RuntimeException ignored){}
    }
    private void renderStats(){
        refreshMetrics();
        int due=0,weak=0;
        long now=System.currentTimeMillis();
        for(int i=0;i<progress.unlocked;i++){
            if(progress.dueAt[i]>0 && progress.dueAt[i]<=now)due++;
            if(progress.misses[i]>0)weak++;
        }
        stats.setText(
          "Доступно символов: "+progress.unlocked+" из "+alphabet.size()+
          "\n\nПопыток текущего этапа: "+progress.attempts+
          "\nПравильно без повторов: "+progress.cleanCorrect+
          "\nТочность контроля: "+progress.accuracy()+"%"+
          "\nСимволов для повторения: "+due+
          "\nСимволов с ошибками: "+weak+
          "\n\nСледующий символ открывается после ≥40 контрольных попыток, ≥90% общей точности и проверки новых букв."+
          "\n\nПовторение назначается через 1, 3 и 7 дней."+
          "\n\nКнопки выбора букв служат тренировкой и НЕ повышают уровень.");
    }
    @Override public void onResume(){super.onResume();if(soundStatus!=null)soundStatus.setText("Проверка динамика: нажми SOS.\n"+volumeInfo());}
    @Override public void onPause(){super.onPause();cancelPending();}
    @Override public void onDestroy(){cancelPending();super.onDestroy();}
}
