package com.cwtrainer.pocket;

import android.app.Activity;
import android.os.Bundle;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.view.Gravity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/** Show the official examination PDF page, including diagrams lost in text extraction. */
public final class SrrOriginalPdfActivity extends Activity {
    private static final int BG=Color.rgb(12,24,35),PANEL=Color.rgb(35,57,70),FG=Color.WHITE;
    private ParcelFileDescriptor fileHandle;
    private PdfRenderer pdf;
    private ImageView image;
    private TextView heading,status;
    private int page=1,scale=1;
    private final float[] factors={1.3f,1.8f,2.5f};
    private Bitmap current;
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private Button button(String text){
        Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextSize(14);
        b.setTextColor(FG);b.setBackgroundTintList(ColorStateList.valueOf(PANEL));return b;
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        int question=getIntent().getIntExtra("questionId",1);
        try{page=SrrQuestionPages.page(question);}
        catch(RuntimeException ignored){page=1;}
        ScrollView vertical=new ScrollView(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(6),dp(12),dp(6),dp(12));root.setBackgroundColor(BG);
        vertical.addView(root);setContentView(vertical);
        heading=new TextView(this);heading.setTextColor(FG);heading.setGravity(Gravity.CENTER);
        heading.setTextSize(16);root.addView(heading);
        LinearLayout controls=new LinearLayout(this);controls.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(controls);
        Button previous=button("◀ Стр.");controls.addView(previous,new LinearLayout.LayoutParams(0,dp(50),1));
        previous.setOnClickListener(v->showPage(page-1));
        Button zoom=button("Масштаб +");controls.addView(zoom,new LinearLayout.LayoutParams(0,dp(50),1));
        zoom.setOnClickListener(v->{scale=(scale+1)%factors.length;renderPage();});
        Button next=button("Стр. ▶");controls.addView(next,new LinearLayout.LayoutParams(0,dp(50),1));
        next.setOnClickListener(v->showPage(page+1));
        HorizontalScrollView horizontal=new HorizontalScrollView(this);
        image=new ImageView(this);image.setAdjustViewBounds(true);
        horizontal.addView(image);root.addView(horizontal);
        status=new TextView(this);status.setTextColor(Color.rgb(175,197,209));
        status.setTextSize(13);root.addView(status);
        try{
            File file=new File(getCacheDir(),"srr_source_questions.pdf");
            if(!file.exists() || file.length()<100000){
                try(InputStream in=getAssets().open("srr_first_category_source.pdf");
                    FileOutputStream out=new FileOutputStream(file)){
                    byte[] buf=new byte[8192];int n;
                    while((n=in.read(buf))!=-1)out.write(buf,0,n);
                }
            }
            fileHandle=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);
            pdf=new PdfRenderer(fileHandle);
            showPage(page);
        }catch(Exception error){
            status.setText("Не удалось открыть официальный документ: "+error.getMessage());
        }
    }
    private void showPage(int requested){
        if(pdf==null)return;
        page=Math.max(0,Math.min(pdf.getPageCount()-1,requested));
        renderPage();
    }
    private void renderPage(){
        if(pdf==null)return;
        try(PdfRenderer.Page open=pdf.openPage(page)){
            int width=Math.min(2400,Math.round(open.getWidth()*factors[scale]));
            int height=Math.min(3200,Math.round(open.getHeight()*factors[scale]));
            Bitmap imageData=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
            imageData.eraseColor(Color.WHITE);
            open.render(imageData,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            Bitmap previous=current;current=imageData;
            image.setImageBitmap(imageData);
            if(previous!=null && previous!=imageData) image.post(previous::recycle);
            heading.setText("Официальный перечень · стр. "+(page+1)+"/"+pdf.getPageCount());
            status.setText("Показана исходная страница PDF, включая схемы и рисунки. Листай страницы, если вопрос переходит на следующую.");
        }catch(Exception error){
            status.setText("Ошибка изображения PDF: "+error.getMessage());
        }
    }
    @Override public void onDestroy(){
        image.setImageDrawable(null);
        if(current!=null){current.recycle();current=null;}
        try{if(pdf!=null)pdf.close();}catch(Exception ignored){}
        try{if(fileHandle!=null)fileHandle.close();}catch(Exception ignored){}
        super.onDestroy();
    }
}
