package com.cwtrainer.pocket;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * An independent, app-specific adaptation of CW Academy Beginner 2025.
 * Sources: https://cwops.org/wp-content/uploads/2025/02/Beginner-curriculum.htm
 * The real 16-session course includes advisor-led sending and on-air work.
 */
public final class CwCoursePlan {
    private CwCoursePlan() {}
    public static final String SOURCE="CWops CW Academy Beginner, 4th ed., Feb 2025";
    public static final String[] ADDED={
        "A E N T",                    // 01
        "S I O 1 4",                  // 02
        "D H L R 2 5",                // 03
        "C U",                      // 04
        "M W 3 6 ?",                // 05
        "F Y ,",                    // 06
        "G P Q 7 9 /",             // 07
        "B V <AR>",                // 08
        "J K 0 8 <BT>",            // 09
        "X Z . <BK> <SK>",         // 10
        "", "", "", "", "", ""
    };
    public static final String[] TITLES={
        "Первые звуки: A E N T",
        "Гласные, S и первые цифры",
        "Буквы D H L R и цифры",
        "Буквы C U и короткие слова",
        "M W, числа и вопрос",
        "F Y и пунктуация",
        "G P Q, цифры и позывные",
        "B V и знак <AR>",
        "J K, цифры и <BT>",
        "Все буквы, <BK> и <SK>",
        "Распознавание без задержки",
        "Позывные и рапорты RST",
        "Диалоги и Q-сигналы",
        "Контроль реальных сообщений",
        "Обмен позывными и данными",
        "Итоговая тренировка QSO"
    };
    private static final String[] WORD_BANK={
      "TEA TEN NET TEE ANT NEAT EAT TAN AT",
      "STONE NOTE TIN TON TEN ONE NOISE TIE SITE NET NINE TONE",
      "HELLO LATER RADIO SIDE TALL HILL SHE RISE HER TRAIN DIAL",
      "OUCH CHAT CHIN CHAIR TOUCH SUCH SUN HOLD TAIL RAIL RAIN",
      "WAIT WELL MILL WALL WHAT WATER TOWER WERE WITH DATE WET",
      "YOU TOY ROOT FAIR FOOT TEETH SAY FUR THEY FARE YET",
      "PAGE PAPER GLAD GLARE PENCIL PEN PIG GAIN GUARD GAS",
      "VOTE VIEW WAVE VALVE SAVE BEST BED BARN VOW BORE",
      "JOKE JET JUST JUMP KITE JACK KENT KILL KING",
      "ZERO ZONE EXTRA X RAZOR FOX ZEBRA NEXT SIX QSO",
      "CQ DE RST NAME QTH RIG PWR ANT HW CPI",
      "RST 559 579 599 QRM QTH QSB QSL RIG PWR",
      "CQ DE TNX FER UR RST RIG QTH NAME",
      "CALL RST QTH NAME WX ANT RIG PWR",
      "CQ DE RST 599 QTH TEST HW CPI",
      "CQ CQ DE RST 599 QTH NAME TU 73"
    };
    private static final String[] CALL_BANK={
      "N1AT N4TE A1N",
      "N1AS N4ON S4IT",
      "DL1AT HH5H NA4T",
      "NC5A NA2T CU1LL",
      "W3AA N3AM DM5RA",
      "F5IN YO1AR AA3U",
      "G4AN N1AR W9UCA",
      "B5V V7AN AB1V",
      "K1JT J8AN K0TN",
      "W1AW K1ABC DL0ZZ G4XYZ",
      "W1AW N0CALL K1ABC",
      "K1ABC DL1XYZ",
      "K1ABC F4ABC",
      "N0CALL K1ABC",
      "DL1AAA W1AW",
      "W1AW K1ABC N0CALL"
    };
    private static final String[] EXCHANGES={
      "TEA TEN NET", "NO NET STN", "RST IS 555",
      "UR RST IS 555", "NAME IS WILL", "UR NAME?",
      "RIG IS ICOM", "GD SIG RON", "UR RST IS 579",
      "CQ CQ DE W1AW K",
      "CQ CQ DE W1AW W1AW K",
      "K1ABC DE W1AW RST 599 BK",
      "TNX FER CALL UR RST 579 QTH LONDON",
      "CQ TEST DE K1ABC K",
      "K1ABC DE W1AW UR RST 559 QTH PARIS",
      "CQ CQ DE W1AW K  K1ABC DE W1AW RST 579 QTH LONDON TU 73 SK"
    };
    private static final LinkedHashMap<String,String> CODES=new LinkedHashMap<>();
    static {
        String letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String[] codes={".-","-...","-.-.","-..",".","..-.","--.","....","..",
            ".---","-.-",".-..","--","-.","---",".--.","--.-",".-.","...","-",
            "..-","...-",".--","-..-","-.--","--.."};
        for(int i=0;i<26;i++)CODES.put(String.valueOf(letters.charAt(i)),codes[i]);
        String[] nums={"-----",".----","..---","...--","....-",".....",
                       "-....","--...","---..","----."};
        for(int i=0;i<=9;i++)CODES.put(String.valueOf(i),nums[i]);
        CODES.put("?","..--..");CODES.put(",","--..--");
        CODES.put("/","-..-.");CODES.put(".",".-.-.-");
        CODES.put("<AR>",".-.-.");CODES.put("<BT>","-...-");
        CODES.put("<BK>","-...-.-");CODES.put("<SK>","...-.-");
        // Russian letters use the same international dot/dash codes.
        for(MorseCourse.Symbol symbol:MorseCourse.alphabet(true))
            CODES.put(symbol.ru,symbol.code.trim());
        CODES.put("Ё",CODES.get("Е"));
    }
    public static Map<String,String> codes(){return Collections.unmodifiableMap(CODES);}
    public static String code(String token){return CODES.get(token);}
    public static List<String> tokenize(String text) {
        ArrayList<String> out=new ArrayList<>();
        for(int i=0;i<text.length();){
            if(Character.isWhitespace(text.charAt(i))){out.add(" ");i++;continue;}
            if(text.charAt(i)=='<'){
                int end=text.indexOf('>',i+1);
                if(end<0)throw new IllegalArgumentException("Prosign must close: "+text);
                String token=text.substring(i,end+1).toUpperCase();
                if(!CODES.containsKey(token))throw new IllegalArgumentException("Unknown: "+token);
                out.add(token);i=end+1;
            }else{
                String token=String.valueOf(Character.toUpperCase(text.charAt(i)));
                if(!CODES.containsKey(token))throw new IllegalArgumentException("Unknown: "+token);
                out.add(token);i++;
            }
        }
        return out;
    }
    public static int sessions(){return TITLES.length;}
    public static List<String> introduced(int session){
        if(session<1||session>16)throw new IllegalArgumentException("Session 1..16");
        ArrayList<String> symbols=new ArrayList<>();
        for(int s=0;s<Math.min(10,session);s++){
            for(String k:ADDED[s].split(" ")){
                if(!k.isEmpty() && !symbols.contains(k))symbols.add(k);
            }
        }
        return symbols;
    }
    public static List<String> newSymbols(int session) {
        if(session<1||session>16)throw new IllegalArgumentException("Session 1..16");
        ArrayList<String> symbols=new ArrayList<>();
        for(String key:ADDED[session-1].split(" "))if(!key.isEmpty())symbols.add(key);
        return symbols;
    }
    public enum Kind { CHARACTER, GROUP, WORD, ABBREVIATION, CALLSIGN, MESSAGE, SENDING }
    private static List<String> split(String src){
        ArrayList<String> result=new ArrayList<>();
        for(String s:src.split(" +"))if(!s.trim().isEmpty())result.add(s);
        return result;
    }
    private static List<String> words(String src,int session){
        ArrayList<String> list=new ArrayList<>();
        for(String word:split(src))if(isIntroduced(word,session))list.add(word);
        return list;
    }
    public static boolean isIntroduced(String text,int session){
        List<String> known=introduced(session);
        try{
            for(String token:tokenize(text))
                if(!token.equals(" ")&&!known.contains(token))return false;
            return true;
        }catch(IllegalArgumentException ex){return false;}
    }
    public static List<String> exercises(int session,Kind kind){
        if(session<1||session>16)throw new IllegalArgumentException("Invalid session");
        if(kind==Kind.CHARACTER||kind==Kind.SENDING)return introduced(session);
        if(kind==Kind.GROUP)return Collections.emptyList(); // randomly generated
        ArrayList<String> results=new ArrayList<>();
        if(kind==Kind.WORD){
            for(int i=0;i<session;i++)results.addAll(words(WORD_BANK[i],session));
        } else if(kind==Kind.ABBREVIATION){
            String[] corpus={"DE","RST","QTH","QRM","QSB","QSL","TU","TNX","CQ","FER",
              "UR","ES","AGN","DX","73","599","599","HW","BK","FB","OM","WX"};
            for(String token:corpus)if(isIntroduced(token,session))results.add(token);
        } else if(kind==Kind.CALLSIGN){
            for(int i=0;i<session;i++)results.addAll(words(CALL_BANK[i],session));
        } else if(kind==Kind.MESSAGE){
            for(int i=0;i<session;i++)
                if(isIntroduced(EXCHANGES[i],session))results.add(EXCHANGES[i]);
            // Support word-separated messages in the earliest sessions.
            if(results.isEmpty()){
                results.add("TEA TEN");results.add("NET TEN");
            }
        }
        return Collections.unmodifiableList(results);
    }
    public static String randomGroup(int session,int length,Random random) {
        List<String> choices=introduced(session);
        StringBuilder s=new StringBuilder();
        for(int i=0;i<length;i++){
            String c=choices.get(random.nextInt(choices.size()));
            // Reserved procedural symbols should be taught separately, not mixed into typed groups.
            if(c.startsWith("<")){i--;continue;}
            s.append(c);
        }
        return s.toString();
    }
    public static String next(int session,Kind kind,Random random) {
        if(kind==Kind.GROUP)return randomGroup(session,session<=2?3:5,random);
        List<String> items=exercises(session,kind);
        if(items.isEmpty())return randomGroup(session,3,random);
        return items.get(random.nextInt(items.size()));
    }
}
