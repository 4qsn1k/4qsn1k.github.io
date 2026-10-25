package dev.mi13.agent;

import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class AminaSchedule {
    public static final String APP="ru.mos.amina.app";
    public static final String ALARM="dev.mi13.agent.AMINA_CHECK";
    public static final String PREF="amina_schedule";
    private static final Handler handler=new Handler(Looper.getMainLooper());
    private static final String CHANNEL="amina_check_status";
    private static volatile boolean busy=false;
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREF,0);}
    public static boolean enabled(Context c){return prefs(c).getBoolean("enabled",false);}
    public static int hour(Context c){return prefs(c).getInt("hour",9);}
    public static int minute(Context c){return prefs(c).getInt("minute",0);}
    public static String status(Context c){return prefs(c).getString("status","Ещё не проверялось");}
    public static String at(Context c){return prefs(c).getString("last_at","—");}
    public static void configure(Context c,int h,int m){
        prefs(c).edit().putInt("hour",h).putInt("minute",m).putBoolean("enabled",true).apply();
        schedule(c);
    }
    public static void disable(Context c){
        prefs(c).edit().putBoolean("enabled",false).apply();
        ((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).cancel(pending(c));
        Engine.note("Расписание Амины отключено.");
    }
    private static PendingIntent pending(Context c){
        Intent i=new Intent(c,AminaReceiver.class).setAction(ALARM);
        return PendingIntent.getBroadcast(c,1182,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    public static boolean exactAllowed(Context c){
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT<31 || am.canScheduleExactAlarms();
    }
    public static void schedule(Context c){
        if(!enabled(c))return;
        Calendar next=Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY,hour(c));
        next.set(Calendar.MINUTE,minute(c));
        next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);
        if(next.getTimeInMillis()<=System.currentTimeMillis())next.add(Calendar.DATE,1);
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        try{
            if(exactAllowed(c))am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pending(c));
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pending(c));
            Engine.note("Амина: следующая проверка "+new SimpleDateFormat("dd.MM.yyyy HH:mm",Locale.getDefault()).format(next.getTime())+
                (exactAllowed(c)?" (точный сигнал)":" (приблизительное время: нет разрешения будильника)"));
        }catch(Exception e){Engine.note("Ошибка расписания: "+e.getMessage());}
    }
    public static void run(Context c,String trigger){
        if(busy){Engine.note("Амина: проверка уже выполняется.");return;}
        busy=true;
        Context app=c.getApplicationContext();
        Engine.note("Амина: проверка по событию "+trigger);
        KeyguardManager kg=(KeyguardManager)app.getSystemService(Context.KEYGUARD_SERVICE);
        if(kg.isDeviceLocked()){finish(app,"НЕ ПРОВЕРЕНО: телефон заблокирован. Разблокируйте его и нажмите «Проверить сейчас».",true);return;}
        AgentService svc=AgentService.current;
        if(svc==null){finish(app,"НЕ ПРОВЕРЕНО: включите службу специальных возможностей MI13 Agent.",true);return;}
        try {
            JSONObject action=new JSONObject().put("action","launch").put("package",APP);
            svc.doAction(action,result->{
                if(!result.startsWith("OK")){finish(app,"НЕ ПРОВЕРЕНО: "+result,true);return;}
                handler.postDelayed(()->{
                    AgentService a=AgentService.current;
                    if(a==null){finish(app,"НЕ ПРОВЕРЕНО: служба выключилась.",true);return;}
                    a.captureTreeOnly(snapshot->evaluate(app,snapshot));
                },6500);
            });
        }catch(Exception e){finish(app,"НЕ ПРОВЕРЕНО: "+e.getMessage(),true);}
    }
    private static void evaluate(Context app,AgentService.Snapshot s){
        if(!APP.equals(s.packageName)){
            finish(app,"НЕ ПРОВЕРЕНО: открыто другое окно ("+s.packageName+").",true);return;
        }
        String tree=s.tree.toLowerCase(Locale.ROOT);
        boolean green=tree.contains("геолокация переда")||tree.contains("геоданные переда")
            ||tree.contains("местоположение переда");
        boolean negative=tree.contains("не передаётся")||tree.contains("не передается")
            ||tree.contains("геолокация отключена")||tree.contains("нет доступа к геолокации");
        if(negative){finish(app,"ОШИБКА: интерфейс сообщает о проблеме с геолокацией.",true);return;}
        String[] labels={"последняя передача","последняя отправка","последнее обновление",
          "обновлено","последний раз","передано","последняя геолокация"};
        Date last=null;
        for(String label:labels){
            int idx=tree.indexOf(label);
            if(idx<0)continue;
            String near=tree.substring(idx,Math.min(tree.length(),idx+320));
            Matcher m=Pattern.compile("(\\d{2}\\.\\d{2}\\.\\d{4})\\s*(?:в\\s*)?(\\d{1,2}:\\d{2})").matcher(near);
            if(m.find()){
                try{last=new SimpleDateFormat("dd.MM.yyyy HH:mm",Locale.ROOT).parse(m.group(1)+" "+m.group(2));}
                catch(Exception ignored){}
            }
            if(last!=null)break;
        }
        if(green&&last!=null){
            long age=System.currentTimeMillis()-last.getTime();
            if(age>=-120000 && age<=3600000){
                finish(app,"ПОДТВЕРЖДЕНО ИНТЕРФЕЙСОМ: передача отображается; последняя отправка "+new SimpleDateFormat("HH:mm",Locale.getDefault()).format(last)+".",false);
            }else finish(app,"ВНИМАНИЕ: передача отображается, но последняя отправка не свежая.",true);
        }else if(green){
            finish(app,"ЧАСТИЧНАЯ ПРОВЕРКА: отображается «Геолокация передаётся», но время последней отправки не найдено.",true);
        }else finish(app,"НЕ ПРОВЕРЕНО: признак успешной передачи геолокации не найден.",true);
    }
    private static void finish(Context c,String result,boolean alert){
        busy=false;
        String when=new SimpleDateFormat("dd.MM.yyyy HH:mm:ss",Locale.getDefault()).format(new Date());
        prefs(c).edit().putString("last_at",when).putString("status",result).apply();
        Engine.note("Амина ["+when+"]: "+result);
        notification(c,alert?"Амина: требуется проверка":"Амина: проверка пройдена",result,alert);
    }
    private static void notification(Context c,String title,String message,boolean alert){
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Амина: ежедневная проверка",
              alert?NotificationManager.IMPORTANCE_HIGH:NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open=PendingIntent.getActivity(c,42,new Intent(c,AminaMonitorActivity.class),
              PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification n=new android.app.Notification.Builder(c,CHANNEL)
              .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title)
              .setContentText(message).setStyle(new android.app.Notification.BigTextStyle().bigText(message))
              .setContentIntent(open).setAutoCancel(true).build();
        try{nm.notify(4441,n);}catch(SecurityException e){Engine.note("Не разрешены уведомления.");}
    }
}