package com.cwtrainer.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.Typeface;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import android.graphics.drawable.GradientDrawable;
import java.util.*;
import java.io.ByteArrayOutputStream;

public class MainActivity extends Activity {
    private final String[] names = {"К","М","Р","С","У","А","П","Т","Л","О","В","И","Н","Й","Е","Ф","Ы","Ж","Г","З","Х","Б","Ц","Д","Ь","Ч","Ш","Щ","Ъ","Э","Ю","Я"};
    private final String[] codes = {"-.-","--",".-.","...","..-",".-",".--.","-",".-..","---",".--","..","-."," .---",".","..-.","-.--","...-","--.","--..","....","-...","-.-.","-..","-..-","---.","----","--.-","--.--","..-..","..--",".-.-"};
    private final Random random = new Random();
    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private LinearLayout screen, buttons;
    private TextView title, info, symbol, status, progress;
    private Button replay, advance, mode;
    private final Button[] answers = new Button[4];
    private int stage=2, question=-1, answered=0, soundEpoch=0;
    private boolean busy=false, learning=false;
    private String history="";
    private static final int BG=Color.rgb(14,26,37), PANEL=Color.rgb(29,46,61), WHITE=Color.WHITE, MUTED=Color.rgb(180,200,214), ACCENT=Color.rgb(50,159,147);
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private GradientDrawable rounded(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String value,int size,int color){
        TextView v=new TextView(this);v.setText(value);v.setTextColor(color);v.setTextSize(size);v.setGravity(Gravity.CENTER);return v;
    }
    private Button button(String value,int color){
        Button b=new Button(this);b.setText(value);b.setTextSize(21);b.setTextColor(WHITE);b.setAllCaps(false);b.setBackgroundTintList(ColorStateList.valueOf(color));return b;
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        prefs=getSharedPreferences("cw_pocket_01",Context.MODE_PRIVATE);
        stage=Math.max(2,Math.min(names.length,prefs.getInt("stage",2)));
        history=prefs.getString("history","");
        buildScreen();newQuestion();
    }
    private void buildScreen(){
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        screen=new LinearLayout(this);screen.setOrientation(LinearLayout.VERTICAL);screen.setPadding(dp(16),dp(16),dp(16),dp(20));screen.setBackgroundColor(BG);
        scroll.addView(screen);setContentView(scroll);
        title=text("CW TRAINER  ·  POCKET",21,Color.rgb(117,234,205));title.setTypeface(null,Typeface.BOLD);screen.addView(title);
        info=text("",16,MUTED);info.setPadding(0,dp(12),0,dp(6));screen.addView(info);
        symbol=text("?",88,WHITE);symbol.setTypeface(null,Typeface.BOLD);
        symbol.setBackground(rounded(PANEL,16));LinearLayout.LayoutParams s=new LinearLayout.LayoutParams(-1,dp(190));s.setMargins(0,dp(12),0,dp(12));screen.addView(symbol,s);
        status=text("",18,MUTED);screen.addView(status);
        buttons=new LinearLayout(this);buttons.setOrientation(LinearLayout.VERTICAL);
        screen.addView(buttons,new LinearLayout.LayoutParams(-1,-2));
        for(int i=0;i<4;i++){final int n=i;answers[i]=button("?",ACCENT);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(63));lp.setMargins(0,dp(6),0,0);buttons.addView(answers[i],lp);answers[i].setOnClickListener(v->answer(n));}
        replay=button("▶ Повторить звук",PANEL);LinearLayout.LayoutParams rlp=new LinearLayout.LayoutParams(-1,dp(58));rlp.setMargins(0,dp(16),0,0);screen.addView(replay,rlp);replay.setOnClickListener(v->playCurrent());
        advance=button("Следующая буква",PANEL);LinearLayout.LayoutParams alp=new LinearLayout.LayoutParams(-1,dp(56));alp.setMargins(0,dp(8),0,0);screen.addView(advance,alp);advance.setVisibility(View.GONE);advance.setOnClickListener(v->newQuestion());
        mode=button("Знакомство с буквами",PANEL);LinearLayout.LayoutParams mlp=new LinearLayout.LayoutParams(-1,dp(53));mlp.setMargins(0,dp(8),0,0);screen.addView(mode,mlp);
        mode.setOnClickListener(v->{learning=!learning;busy=false;mode.setText(learning?"Вернуться к тесту":"Знакомство с буквами");newQuestion();});
        progress=text("",14,MUTED);progress.setPadding(0,dp(12),0,0);screen.addView(progress);
        TextView footer=text("Звук 650 Гц · 18 WPM · офлайн",13,MUTED);footer.setPadding(0,dp(14),0,0);screen.addView(footer);
    }
    private void refreshHeader(){
        info.setText("Урок "+(stage-1)+"  ·  изучено "+stage+"/"+names.length+" букв");
        int n=0,k=0;for(String a:history.split(";"))if(!a.isEmpty()){n++;if(a.startsWith("1"))k++;}
        progress.setText("Проверено: "+n+"/40  ·  точность: "+(n==0?0:(100*k/n))+"%\nНовая буква: "+names[stage-1]+". Переход после 40 ответов и ≥90%.");
    }
    private int choose(){
        ArrayList<Integer> pool=new ArrayList<>();
        for(int i=0;i<stage;i++){
            int weight=(i==stage-1?6:2);
            if(history.contains("0"+i+","))weight+=2;
            for(int j=0;j<weight;j++)pool.add(i);
        }
        return pool.get(random.nextInt(pool.size()));
    }
    private void newQuestion(){
        soundEpoch++;
        busy=false;answered=0;advance.setVisibility(View.GONE);
        question=choose();refreshHeader();
        status.setText(learning?"Нажми букву, чтобы услышать сигнал":"Какую букву ты услышал?");
        symbol.setText(learning ? names[question]+"\n"+codes[question].trim() : "?");
        symbol.setTextSize(learning?40:88);
        ArrayList<Integer> options=new ArrayList<>();
        options.add(question);
        ArrayList<Integer> other=new ArrayList<>();for(int i=0;i<stage;i++)if(i!=question)other.add(i);
        Collections.shuffle(other,random);
        for(int i=0;i<Math.min(3,other.size());i++)options.add(other.get(i));
        Collections.shuffle(options,random);
        for(int i=0;i<answers.length;i++){
            Button b=answers[i];
            if(i>=options.size()){b.setVisibility(View.GONE);b.setTag(null);b.setEnabled(false);continue;}
            int value=options.get(i);
            b.setVisibility(View.VISIBLE);b.setTag(value);b.setText(names[value]);b.setEnabled(true);b.setBackgroundTintList(ColorStateList.valueOf(ACCENT));
        }
        if(learning){status.setText("Послушай звук. Затем возвращайся к тесту.");}
        main.postDelayed(()->{if(!busy && !learning)playCurrent();},300);
    }
    private void answer(int selectedButton){
        if(selectedButton<0 || selectedButton>=answers.length || busy)return;
        Button choice=answers[selectedButton];
        Object tag=choice.getTag();
        if(choice.getVisibility()!=View.VISIBLE || !(tag instanceof Integer))return;
        int selected=(Integer)tag;
        if(learning){question=selected;symbol.setText(names[question]+"\n"+codes[question].trim());playCurrent();return;}
        if(busy)return;
        busy=true;boolean ok=(selected==question);
        String item=(ok?"1":"0")+question+",";
        history+=item+";";
        String[] items=history.split(";");
        if(items.length>40){StringBuilder out=new StringBuilder();for(int i=items.length-40;i<items.length;i++)out.append(items[i]).append(";");history=out.toString();}
        int n=0,k=0,newN=0,newK=0;
        for(String a:history.split(";")){if(a.isEmpty())continue;n++;boolean correct=a.startsWith("1");if(correct)k++;if(a.endsWith((stage-1)+",")){newN++;if(correct)newK++;}}
        for(Button b:answers){
            Object value=b.getTag();
            if(b.getVisibility()!=View.VISIBLE || !(value instanceof Integer))continue;
            b.setEnabled(false);
            int num=(Integer)value;
            b.setBackgroundTintList(ColorStateList.valueOf(num==question?Color.rgb(45,134,90):num==selected?Color.rgb(184,72,69):PANEL));
        }
        symbol.setText(names[question]);symbol.setTextSize(80);
        status.setText(ok?"✓ Правильно":"✗ Это буква "+names[question]);
        if(stage<names.length && n>=40 && 100*k/n>=90 && newN>=8 && 100*newK/newN>=80){
            stage++;history="";status.setText("✓ Открыта новая буква: "+names[stage-1]);
        }
        prefs.edit().putInt("stage",stage).putString("history",history).apply();refreshHeader();
        if(ok){main.postDelayed(()->{if(!learning)newQuestion();},850);}
        else {advance.setVisibility(View.VISIBLE);playCurrent();}
    }
    private void playCurrent(){
        if(question<0)return;final int own=++soundEpoch;final String pattern=codes[question].trim();
        new Thread(()->{
            try{
                int sr=22050;double unit=1200.0/18.0;ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                for(int k=0;k<pattern.length();k++){
                    int millis=(int)Math.round(unit*(pattern.charAt(k)=='-'?3:1));
                    appendTone(bytes,sr,millis,true);
                    if(k<pattern.length()-1)appendTone(bytes,sr,(int)unit,false);
                }
                appendTone(bytes,sr,140,false);
                byte[] data=bytes.toByteArray();
                AudioTrack track=new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setAudioFormat(new AudioFormat.Builder().setSampleRate(sr).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(data.length).build();
                if(own!=soundEpoch){track.release();return;}
                track.write(data,0,data.length);track.play();
                Thread.sleep(800+data.length*1000/(sr*2));
                track.stop();track.release();
            }catch(Exception e){main.post(()->status.setText("Ошибка воспроизведения: "+e.getMessage()));}
        },"MorseTone").start();
    }
    private void appendTone(ByteArrayOutputStream out,int sr,int ms,boolean active){
        int samples=sr*ms/1000;
        for(int i=0;i<samples;i++){
            double fade=Math.min(1.0,Math.min(i,samples-i-1)/(sr*.004));
            short value=(short)(active?Math.sin(2.0*Math.PI*650*i/sr)*10000*Math.max(0,fade):0);
            out.write(value&255);out.write((value>>>8)&255);
        }
    }
    @Override public void onDestroy(){soundEpoch++;super.onDestroy();}
}
