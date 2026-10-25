package dev.mi13.agent;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.TimePickerDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.Locale;

public final class AminaMonitorActivity extends Activity {
    private TextView state,details,logs;
    private LinearLayout col;
    private int dp(int v){return (int)(getResources().getDisplayMetrics().density*v+.5f);}
    private TextView text(String s,int size,boolean header){
        TextView v=new TextView(this);v.setText(s);v.setTextSize(size);
        v.setTextColor(header?Color.rgb(16,38,68):Color.DKGRAY);
        v.setPadding(0,dp(8),0,dp(8));
        if(header)v.setTypeface(null,Typeface.BOLD);
        col.addView(v);return v;
    }
    private Button btn(String title,Runnable action){
        Button b=new Button(this);
        b.setText(title);b.setAllCaps(false);
        col.addView(b,new LinearLayout.LayoutParams(-1,dp(54)));
        b.setOnClickListener(v->action.run());
        return b;
    }
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        ScrollView scroll=new ScrollView(this);
        col=new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20),dp(25),dp(20),dp(20));
        col.setBackgroundColor(Color.rgb(246,248,251));
        scroll.addView(col);
        text("АМИНА • ежедневная проверка",24,true);
        text("Бесплатно. Работает на Xiaomi без подключения к компьютеру и без OpenAI API.",14,false);
        state=text("",17,true);
        details=text("",14,false);
        btn("1. Включить службу управления",()->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        btn("2. Выбрать ежедневное время",()->{
            TimePickerDialog t=new TimePickerDialog(this,(picker,h,m)->{
                AminaSchedule.configure(this,h,m);
                updateInfo();
            },AminaSchedule.hour(this),AminaSchedule.minute(this),true);
            t.show();
        });
        btn("3. Разрешить точные будильники",()->{
            if(Build.VERSION.SDK_INT>=31){
                try{
                    Intent i=new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        android.net.Uri.parse("package:"+getPackageName()));
                    startActivity(i);
                }catch(Exception ex){Engine.note("Откройте Настройки → Приложения → Особые разрешения → Будильники.");}
            }
            updateInfo();
        });
        btn("4. Включить уведомления",()->{
            if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},12);
            else startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));
        });
        btn("Проверить Амину сейчас",()->{
            AminaSchedule.run(this,"ручной тест");
            updateInfo();
        });
        btn("Отключить ежедневную проверку",()->{
            AminaSchedule.disable(this);updateInfo();
        });
        text("Правила проверки",17,true);
        text("Сверяется окно ru.mos.amina.app, сообщение о передаче геолокации и дата последней отправки. Если нет времени или телефон заблокирован, результат не считается подтверждением.",14,false);
        text("Реальные координаты не меняются. Сервис Амины не вызывается напрямую. Подтверждается только информация, видимая в самом приложении.",14,false);
        text("Для HyperOS: разрешите автозапуск и поставьте «Без ограничений» в настройках батареи для MI13 Agent и Амины.",14,false);
        text("Последняя проверка",17,true);
        logs=text("",13,false);
        setContentView(scroll);
        updateInfo();
    }
    private void updateInfo(){
        if(state==null)return;
        String now=AgentService.current==null?"Служба управления: не включена":"Служба управления: активна";
        if(AminaSchedule.enabled(this)){
            now+="\nРасписание: ежедневно "+
                 String.format(Locale.ROOT,"%02d:%02d",AminaSchedule.hour(this),AminaSchedule.minute(this));
        }else now+="\nРасписание: выключено";
        state.setText(now);
        details.setText(AminaSchedule.exactAllowed(this)?"Точное время: разрешено":"Точное время: не разрешено, возможна задержка.");
        logs.setText(AminaSchedule.at(this)+"\n"+AminaSchedule.status(this)+"\n\n"+Engine.getLog());
    }
    @Override public void onResume(){
        super.onResume();
        Engine.setListener((log,active,waiting)->updateInfo());
        updateInfo();
    }
    @Override public void onPause(){
        Engine.setListener(null);
        super.onPause();
    }
}