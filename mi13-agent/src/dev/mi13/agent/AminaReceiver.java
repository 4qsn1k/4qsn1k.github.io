package dev.mi13.agent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class AminaReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx,Intent intent) {
        String action=intent==null?"":intent.getAction();
        if(AminaSchedule.ALARM.equals(action)){
            AminaSchedule.schedule(ctx);
            AminaSchedule.run(ctx,"ежедневный сигнал");
        } else {
            AminaSchedule.schedule(ctx);
        }
    }
}