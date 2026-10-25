package dev.mi13.agent;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Display;
import android.view.WindowManager;
import android.view.Gravity;
import android.view.View;
import android.graphics.Color;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.hardware.HardwareBuffer;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.util.Locale;

public final class AgentService extends AccessibilityService {
    public static volatile AgentService current;
    private final Handler main = new Handler(Looper.getMainLooper());
    private View confirmationOverlay;
    public volatile Snapshot lastSnapshot;
    public static final class Snapshot {
        public final Map<Integer,AccessibilityNodeInfo> nodes = new HashMap<>();
        public String tree = "";
        public String image = "";
        public String apps = "";
        public int width, height;
        public String packageName = "";
        public String summary() {
            return "Display: " + width + "x" + height + "; foreground=" + packageName
              + "\nInstalled launcher apps:\n" + apps + "\nUI elements:\n" + tree;
        }
    }
    @Override public void onServiceConnected() {
        super.onServiceConnected();
        current = this;
        Engine.note("Служба управления подключена.");
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {}
    @Override public void onInterrupt() {}
    @Override public void onDestroy() {
        if (current == this) current = null;
        hideApprovalOverlay();
        Engine.stop("Служба отключена.");
        super.onDestroy();
    }
    public void capture(java.util.function.Consumer<Snapshot> callback) {
        main.post(() -> {
            final Snapshot s = new Snapshot();
            Point p = new Point();
            WindowManager wm = (WindowManager)getSystemService(WINDOW_SERVICE);
            wm.getDefaultDisplay().getRealSize(p);
            s.width = p.x;
            s.height = p.y;
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) {
                CharSequence pkg = root.getPackageName();
                s.packageName = pkg == null ? "" : pkg.toString();
                int[] count = {0};
                addNode(root, s, 0, count);
            } else s.tree = "(дерево интерфейса недоступно)";
            s.apps = installedApps();
            lastSnapshot = s;
            try {
                takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                    @Override public void onSuccess(ScreenshotResult result) {
                        HardwareBuffer buffer = result.getHardwareBuffer();
                        try {
                            Bitmap hw = Bitmap.wrapHardwareBuffer(buffer, result.getColorSpace());
                            if (hw != null) {
                                int maxEdge = Math.max(hw.getWidth(), hw.getHeight());
                                float scale = Math.min(1f, 1200f / maxEdge);
                                int w = Math.max(1,Math.round(hw.getWidth()*scale));
                                int h = Math.max(1,Math.round(hw.getHeight()*scale));
                                Bitmap src = hw.copy(Bitmap.Config.ARGB_8888,false);
                                Bitmap small = Bitmap.createScaledBitmap(src,w,h,true);
                                ByteArrayOutputStream out = new ByteArrayOutputStream();
                                small.compress(Bitmap.CompressFormat.JPEG, 62, out);
                                s.image = Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);
                                if (small != src) small.recycle();
                                src.recycle();
                            }
                        } catch (Exception e) {
                            Engine.note("Снимок недоступен: " + e.getMessage());
                        } finally {
                            buffer.close();
                            callback.accept(s);
                        }
                    }
                    @Override public void onFailure(int error) {
                        Engine.note("Снимок не получен (код " + error + "). Использую дерево интерфейса.");
                        callback.accept(s);
                    }
                });
            } catch (Exception e) {
                Engine.note("Ошибка снимка: " + e.getMessage());
                callback.accept(s);
            }
        });
    }
    private void addNode(AccessibilityNodeInfo n, Snapshot s, int depth, int[] count) {
        if (n == null || count[0]>=130 || depth>=18 || s.tree.length()>17000) return;
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        boolean visible = n.isVisibleToUser();
        if (visible && r.width()>0 && r.height()>0) {
            int idx = ++count[0];
            s.nodes.put(idx, n);
            String tx = n.isPassword() ? "[PASSWORD MASKED]" : safe(n.getText());
            String desc = safe(n.getContentDescription());
            String cls = safe(n.getClassName());
            String id = safe(n.getViewIdResourceName());
            StringBuilder line = new StringBuilder();
            line.append('#').append(idx).append(" ");
            line.append(cls.replace("android.widget.",""));
            if (!tx.isEmpty()) line.append(" text=").append(tx);
            if (!desc.isEmpty()) line.append(" description=").append(desc);
            if (!id.isEmpty()) line.append(" viewId=").append(id);
            if (n.isClickable()) line.append(" CLICK");
            if (n.isEditable()) line.append(" EDITABLE");
            if (n.isScrollable()) line.append(" SCROLL");
            line.append(" bounds=").append(r.toShortString()).append('\n');
            s.tree += line.toString();
        }
        for (int i=0; i<n.getChildCount(); i++) addNode(n.getChild(i),s,depth+1,count);
    }
    private static String safe(CharSequence c) {
        if (c==null) return "";
        String s = c.toString().replace('\n',' ').replace('\r',' ').replace('\t',' ').trim();
        return s.length()>110 ? s.substring(0,110) : s;
    }
    private String installedApps() {
        try {
            Intent i = new Intent(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> all = getPackageManager().queryIntentActivities(i,0);
            StringBuilder b = new StringBuilder();
            int max=0;
            for (ResolveInfo x: all) {
                if (x.activityInfo == null || x.activityInfo.packageName.equals(getPackageName())) continue;
                String label = safe(x.loadLabel(getPackageManager()));
                b.append(label).append(" = ").append(x.activityInfo.packageName).append('\n');
                if (++max>=90) break;
            }
            return b.toString();
        } catch (Exception e) {return "(список не получен)";}
    }
    public void showApprovalOverlay(String reason) {
        main.post(() -> {
            if(confirmationOverlay!=null)return;
            LinearLayout panel=new LinearLayout(this);
            panel.setOrientation(LinearLayout.VERTICAL);
            panel.setBackgroundColor(Color.WHITE);
            int px=(int)(getResources().getDisplayMetrics().density*16);
            panel.setPadding(px,px,px,px);
            TextView heading=new TextView(this);
            heading.setText("MI13 Agent — подтвердите действие");
            heading.setTextSize(18);
            heading.setTextColor(Color.BLACK);
            panel.addView(heading);
            TextView detail=new TextView(this);
            detail.setText(reason);
            detail.setTextSize(14);
            detail.setTextColor(Color.DKGRAY);
            panel.addView(detail);
            LinearLayout row=new LinearLayout(this);
            Button allow=new Button(this);allow.setText("РАЗРЕШИТЬ");
            Button deny=new Button(this);deny.setText("ОТМЕНИТЬ");
            row.addView(allow,new LinearLayout.LayoutParams(0,-2,1));
            row.addView(deny,new LinearLayout.LayoutParams(0,-2,1));
            panel.addView(row);
            allow.setOnClickListener(v->Engine.approve());
            deny.setOnClickListener(v->Engine.reject());
            WindowManager.LayoutParams lp=new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                android.graphics.PixelFormat.TRANSLUCENT);
            lp.gravity=Gravity.BOTTOM;
            try{
                ((WindowManager)getSystemService(WINDOW_SERVICE)).addView(panel,lp);
                confirmationOverlay=panel;
            }catch(Exception e){Engine.note("Нельзя показать подтверждение: "+e.getMessage());}
        });
    }
    public void hideApprovalOverlay() {
        main.post(() -> {
            if(confirmationOverlay==null)return;
            try{((WindowManager)getSystemService(WINDOW_SERVICE)).removeView(confirmationOverlay);}
            catch(Exception ignored){}
            confirmationOverlay=null;
        });
    }
    public void doAction(JSONObject a, java.util.function.Consumer<String> done) {
        main.post(() -> {
            try {
                String cmd = a.optString("action","").toLowerCase(Locale.ROOT);
                switch (cmd) {
                    case "tap":
                    case "long_tap": {
                        int x = clamp(a.optInt("x",500),0,1000)*screenWidth()/1000;
                        int y = clamp(a.optInt("y",500),0,1000)*screenHeight()/1000;
                        gesture(x,y,x,y,cmd.equals("tap")?90:850, done);
                        return;
                    }
                    case "swipe": {
                        int x1=clamp(a.optInt("x",500),0,1000)*screenWidth()/1000;
                        int y1=clamp(a.optInt("y",700),0,1000)*screenHeight()/1000;
                        int x2=clamp(a.optInt("x2",500),0,1000)*screenWidth()/1000;
                        int y2=clamp(a.optInt("y2",300),0,1000)*screenHeight()/1000;
                        gesture(x1,y1,x2,y2,clamp(a.optInt("duration",420),150,1600),done);
                        return;
                    }
                    case "click": {
                        int id = a.optInt("id",-1);
                        Snapshot s=lastSnapshot;
                        AccessibilityNodeInfo n = s==null ? null : s.nodes.get(id);
                        if (n==null) {done.accept("Нет элемента #"+id);return;}
                        if (n.isPassword()) {done.accept("Запрещено нажимать поле пароля");return;}
                        AccessibilityNodeInfo clickable=n;
                        int depth=0;
                        while(clickable!=null&&!clickable.isClickable()&&depth++<8) clickable=clickable.getParent();
                        if (clickable!=null && clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            done.accept("OK click #"+id);return;
                        }
                        Rect r=new Rect();n.getBoundsInScreen(r);
                        gesture(r.centerX(),r.centerY(),r.centerX(),r.centerY(),90,done);
                        return;
                    }
                    case "type": {
                        String value=a.optString("text","");
                        AccessibilityNodeInfo root=getRootInActiveWindow();
                        AccessibilityNodeInfo edit=root==null?null:root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                        if (edit==null || !edit.isEditable()) {
                            Snapshot s=lastSnapshot;
                            if(s!=null) for(AccessibilityNodeInfo n: s.nodes.values())
                                if(n.isEditable() && n.isFocused()) {edit=n;break;}
                        }
                        if(edit==null || !edit.isEditable()) {done.accept("Не выбрано поле ввода");return;}
                        if(edit.isPassword()) {done.accept("Ввод паролей отключён");return;}
                        Bundle args=new Bundle();
                        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value);
                        done.accept(edit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args)?"OK type":"Не удалось ввести текст");
                        return;
                    }
                    case "back": done.accept(performGlobalAction(GLOBAL_ACTION_BACK)?"OK back":"BACK failed");return;
                    case "home": done.accept(performGlobalAction(GLOBAL_ACTION_HOME)?"OK home":"HOME failed");return;
                    case "recents": done.accept(performGlobalAction(GLOBAL_ACTION_RECENTS)?"OK recents":"RECENTS failed");return;
                    case "notifications": done.accept(performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)?"OK notifications":"Failed");return;
                    case "launch": {
                        String pkg=a.optString("package","");
                        if (!allowedLauncher(pkg)) {done.accept("Приложение не найдено: "+pkg);return;}
                        Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
                        if(launch==null){done.accept("Нет окна запуска: "+pkg);return;}
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(launch);
                        done.accept("OK launch "+pkg);
                        return;
                    }
                    case "wait": main.postDelayed(()->done.accept("OK wait"),clamp(a.optInt("ms",800),300,3000)); return;
                    default: done.accept("Неизвестное действие: "+cmd);
                }
            } catch (Exception e) {done.accept("Ошибка выполнения: "+e.getMessage());}
        });
    }
    private boolean allowedLauncher(String pkg) {
        if (pkg==null || pkg.trim().isEmpty()) return false;
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_LAUNCHER);
        for(ResolveInfo info:getPackageManager().queryIntentActivities(i,0))
            if(info.activityInfo!=null && pkg.equals(info.activityInfo.packageName)) return true;
        return false;
    }
    private int screenWidth(){Snapshot s=lastSnapshot;return s==null?1080:s.width;}
    private int screenHeight(){Snapshot s=lastSnapshot;return s==null?2400:s.height;}
    private int clamp(int a,int min,int max){return Math.min(max,Math.max(min,a));}
    private void gesture(int x,int y,int x2,int y2,int duration,java.util.function.Consumer<String> cb){
        Path path=new Path();path.moveTo(x,y);
        if(x!=x2 || y!=y2) path.lineTo(x2,y2);
        GestureDescription.StrokeDescription stroke=new GestureDescription.StrokeDescription(path,0,duration);
        GestureDescription gesture=new GestureDescription.Builder().addStroke(stroke).build();
        boolean accepted=dispatchGesture(gesture,new GestureResultCallback(){
            @Override public void onCompleted(GestureDescription g){cb.accept("OK gesture");}
            @Override public void onCancelled(GestureDescription g){cb.accept("Жест отменён");}
        },main);
        if(!accepted)cb.accept("Жест не принят системой");
    }
}