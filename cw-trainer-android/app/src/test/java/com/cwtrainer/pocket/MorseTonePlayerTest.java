package com.cwtrainer.pocket;

import org.junit.Test;
import static org.junit.Assert.*;

public class MorseTonePlayerTest {
    private static int little(byte[] b,int at){
        return (b[at]&255) | ((b[at+1]&255)<<8) | ((b[at+2]&255)<<16) | ((b[at+3]&255)<<24);
    }
    @Test public void synthesizedMorseContainsAudibleSamples(){
        byte[] a=MorseTonePlayer.pcm(".-",25);
        assertTrue("PCM must contain 16-bit audio",a.length>44000);
        boolean nonzero=false;
        for(int i=0;i+1<a.length;i+=2)
            if((a[i]!=0 || a[i+1]!=0)){nonzero=true;break;}
        assertTrue("PCM samples must not be silent",nonzero);
    }
    @Test public void wavContainerHasCorrectPcmHeader(){
        byte[] pcm=MorseTonePlayer.pcm("...---...",25);
        byte[] wav=MorseTonePlayer.wav(pcm);
        assertEquals(pcm.length+44,wav.length);
        assertEquals("RIFF",new String(wav,0,4,java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals("WAVE",new String(wav,8,4,java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals("fmt ",new String(wav,12,4,java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals(44100,little(wav,24));
        assertEquals(16,(wav[34]&255));
        assertEquals("data",new String(wav,36,4,java.nio.charset.StandardCharsets.US_ASCII));
        assertEquals(pcm.length,little(wav,40));
        assertEquals(wav.length-8,little(wav,4));
    }
    @Test(expected=IllegalArgumentException.class)
    public void wrongPatternIsRejected(){
        MorseTonePlayer.pcm("?",25);
    }
}
