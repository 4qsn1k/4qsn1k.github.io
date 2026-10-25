package dev.mi13.agent;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private EditText task,key,model;
    private TextView status,log;
    private CheckBox consent;
    private Button run,stop,approve,reject;
    private ScrollView scroll;
    private int dp(float v){return (int)(getResources().getDisplayMetrics().density*v+.5f);}
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(11,22,39));
        getWindow().setNavigationBarColor(Color.rgb(11,22,39));
        ScrollView view=new ScrollView(this);scroll=view;
        view.setFillViewport(true);
        LinearLayout panel=new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(20),dp(24),dp(20),dp(28));
        panel.setBackgroundColor(Color.rgb(245,248,251));
        view.addView(panel);
        TextView title=new TextView(this);
        title.setText("MI13 AGENT");
        title.setTextColor(Color.rgb(16,38,68));
        title.setTextSize(27);title.setTypeface(null,Typeface.BOLD);
        panel.addView(title);
        TextView subtitle=label("Автоматическое управление Xiaomi через ИИ.\nБез root, ПК и внешних плат.");
        panel.addView(subtitle);
        Button amina=button("АМИНА — ежедневная проверка бесплатно",panel);
        amina.setOnClickListener(v->startActivity(new Intent(this,AminaMonitorActivity.class)));
        status=label("Проверка службы...");
        status.setTextColor(Color.rgb(20,95,85));
        status.setTypeface(null,Typeface.BOLD);
        panel.addView(status);
        Button enable=button("1. Открыть специальные возможности",panel);
        enable.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        panel.addView(label("В разделе «Загруженные приложения» включите MI13 Agent. Для приложения из APK HyperOS может потребовать разрешить ограниченные настройки."));
        panel.addView(section("2. Дополнительный режим: ИИ через платный API"));
        panel.addView(label("Для проверки Амины ключ OpenAI API не нужен. Откройте раздел «АМИНА» выше."));
        key=new EditText(this);
        key.setHint("Ключ OpenAI API: sk-...");
        key.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setSingleLine(true);
        key.setText(SecureStore.load(this));
        panel.addView(key);
        model=new EditText(this);
        model.setSingleLine(true);
        model.setText("gpt-4.1-mini");
        model.setHint("Название модели с поддержкой изображений");
        panel.addView(model);
        Button save=button("Сохранить ключ зашифрованно",panel);
        save.setOnClickListener(v->{
            try {
                SecureStore.save(this,key.getText().toString().trim());
                Engine.note("Ключ сохранён в Android Keystore.");
            }catch(Exception ex){Engine.note("Не удалось сохранить ключ: "+ex.getMessage());}
        });
        Button erase=button("Удалить сохранённый ключ",panel);
        erase.setOnClickListener(v->{
            SecureStore.clear(this);key.setText("");
            Engine.note("Сохранённый ключ очищен.");
        });
        panel.addView(section("3. Задание"));
        task=new EditText(this);
        task.setMinLines(3);task.setMaxLines(5);
        task.setText("Открой настройки телефона и покажи информацию об устройстве.");
        task.setHint("Например: открой Telegram и найди чат ...");
        panel.addView(task);
        consent=new CheckBox(this);
        consent.setText("Разрешаю передавать снимки экрана и текст интерфейса в OpenAI API при выполнении задания. Не открывать конфиденциальные приложения.");
        consent.setTextSize(13);
        panel.addView(consent);
        run=button("▶ ЗАПУСТИТЬ АГЕНТА",panel);
        run.setOnClickListener(v->{
            if(!consent.isChecked()){Engine.note("Сначала подтвердите передачу данных экрана.");return;}
            Engine.start(task.getText().toString(),key.getText().toString(),model.getText().toString());
        });
        stop=button("■ СТОП",panel);
        stop.setOnClickListener(v->Engine.stop("Остановлено пользователем."));
        panel.addView(section("Подтверждение действий"));
        approve=button("Разрешить действие",panel);
        approve.setOnClickListener(v->Engine.approve());
        reject=button("Отклонить и остановить",panel);
        reject.setOnClickListener(v->Engine.reject());
        panel.addView(section("Диагностика без API"));
        Button capture=button("Проверить доступ к экрану",panel);
        capture.setOnClickListener(v->{
            AgentService svc=AgentService.current;
            if(svc==null){Engine.note("Служба ещё не включена.");return;}
            svc.capture(s->Engine.note("Экран получен: "+s.width+"x"+s.height+
                 "; элементов: "+s.nodes.size()+"; JPEG: "+(s.image.length()/1024)+" КБ; окно: "+s.packageName));
        });
        Button home=button("Проверить: Домой",panel);
        home.setOnClickListener(v->manual("{\"action\":\"home\"}"));
        Button back=button("Проверить: Назад",panel);
        back.setOnClickListener(v->manual("{\"action\":\"back\"}"));
        panel.addView(section("Журнал"));
        log=label("...");
        log.setTextSize(12);
        log.setTextIsSelectable(true);
        panel.addView(log);
        panel.addView(label("Версия 0.2 • Амина работает без API • не использовать ИИ для банковских операций"));
        setContentView(view);
    }
    private void manual(String json){
        AgentService s=AgentService.current;
        if(s==null){Engine.note("Служба ещё не включена.");return;}
        try {
            if(s.lastSnapshot==null) s.capture(snapshot->{
                try {s.doAction(new JSONObject(json),Engine::note);}
                catch(Exception e){Engine.note(e.getMessage());}
            });
            else s.doAction(new JSONObject(json),Engine::note);
        } catch(Exception e){Engine.note("Ошибка: "+e.getMessage());}
    }
    private TextView label(String text){
        TextView t=new TextView(this);t.setText(text);
        t.setTextColor(Color.rgb(60,72,83));t.setTextSize(14);
        t.setPadding(0,dp(6),0,dp(9));return t;
    }
    private TextView section(String text){
        TextView t=label(text);t.setTextSize(17);
        t.setTextColor(Color.rgb(16,38,68));t.setTypeface(null,Typeface.BOLD);
        t.setPadding(0,dp(18),0,dp(5));return t;
    }
    private Button button(String text,LinearLayout parent){
        Button b=new Button(this);
        b.setText(text);b.setAllCaps(false);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(48));
        p.bottomMargin=dp(7);parent.addView(b,p);
        return b;
    }
    @Override protected void onResume(){
        super.onResume();
        Engine.setListener((logs,running,waiting)->{
            if(status==null)return;
            status.setText(AgentService.current==null?"Служба выключена":"Служба подключена"+
                (running?" • агент выполняет задачу":""));
            log.setText(logs.isEmpty()?"Событий пока нет.":logs);
            run.setEnabled(!running);
            approve.setEnabled(waiting);reject.setEnabled(waiting);
        });
    }
    @Override protected void onPause(){
        Engine.setListener(null);
        super.onPause();
    }
}