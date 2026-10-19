package com.cwtrainer.pocket;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;

public final class SrrQuestionBank {
    public static final String SOURCE_URL=
        "https://r9c.srr.ru/wp-content/uploads/2026/02/exam-voprosy2023.pdf";
    public static final class Question {
        public final int id;
        public final String prompt;
        public final String[] choices;
        public final int correct;
        Question(int id,String prompt,String[] choices,int correct){
            this.id=id;this.prompt=prompt;this.choices=choices;this.correct=correct;
        }
    }
    private final List<Question> all;
    private static final int[] BOUNDARIES={1,47,100,130,150,387,409,420,427};
    public static final String[] TOPICS={
        "Международные правила и терминология",
        "Нормативные акты РФ",
        "Правила радиообмена",
        "Виды радиосвязи",
        "Теория радиосистем и распространения",
        "Единицы измерения и приборы",
        "Электробезопасность",
        "Электромагнитная совместимость"
    };
    public static int topicOf(int id){
        if(id<1||id>426)throw new IllegalArgumentException("Question "+id);
        for(int i=0;i<8;i++)if(id>=BOUNDARIES[i]&&id<BOUNDARIES[i+1])return i;
        throw new IllegalArgumentException("Question "+id);
    }
    public SrrQuestionBank(Context context) throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(InputStream in=context.getAssets().open("srr_first_category_questions.json")){
            byte[] buffer=new byte[8192];int n;
            while((n=in.read(buffer))>=0)bytes.write(buffer,0,n);
        }
        JSONObject document=new JSONObject(bytes.toString("UTF-8"));
        JSONArray raw=document.getJSONArray("questions");
        ArrayList<Question> collection=new ArrayList<>(raw.length());
        HashSet<Integer> seen=new HashSet<>();
        for(int i=0;i<raw.length();i++){
            JSONObject q=raw.getJSONObject(i);
            int id=q.getInt("id"),right=q.getInt("answer");
            JSONArray options=q.getJSONArray("options");
            if(id<1||id>426||!seen.add(id)||right<0||right>3||options.length()!=4)
                throw new IllegalStateException("Invalid question "+id);
            String[] choices=new String[4];
            for(int k=0;k<4;k++){
                choices[k]=options.getString(k).trim();
                if(choices[k].isEmpty())throw new IllegalStateException("Empty option "+id);
            }
            String prompt=q.getString("question").trim();
            if(prompt.isEmpty())throw new IllegalStateException("Empty question "+id);
            collection.add(new Question(id,prompt,choices,right));
        }
        if(collection.size()!=426)throw new IllegalStateException("Missing questions: "+collection.size());
        collection.sort((a,b)->Integer.compare(a.id,b.id));
        for(int i=0;i<426;i++)if(collection.get(i).id!=i+1)
            throw new IllegalStateException("Missing question id "+(i+1));
        all=Collections.unmodifiableList(collection);
    }
    public Question get(int id) {
        if(id<1||id>426)throw new IllegalArgumentException("Question #"+id);
        return all.get(id-1);
    }
    public int size(){return all.size();}
    public List<Question> mockExam(Random rng) {
        ArrayList<Question> chosen=new ArrayList<>();
        java.util.HashSet<Integer> used=new java.util.HashSet<>();
        // One from each published topic; remaining 37 questions drawn at random.
        for(int t=0;t<TOPICS.length;t++){
            int id=BOUNDARIES[t]+rng.nextInt(BOUNDARIES[t+1]-BOUNDARIES[t]);
            chosen.add(get(id));used.add(id);
        }
        ArrayList<Question> shuffled=new ArrayList<>(all);
        Collections.shuffle(shuffled,rng);
        for(Question question:shuffled){
            if(chosen.size()==SrrExamEngine.THEORY_QUESTIONS)break;
            if(used.add(question.id))chosen.add(question);
        }
        Collections.shuffle(chosen,rng);
        return chosen;
    }
    public Question random(Random rng){return all.get(rng.nextInt(all.size()));}
    public Question randomFromTopic(int topic,Random rng){
        if(topic<0||topic>=8)throw new IllegalArgumentException("Topic "+topic);
        int low=BOUNDARIES[topic],high=BOUNDARIES[topic+1];
        return get(low+rng.nextInt(high-low));
    }
}
