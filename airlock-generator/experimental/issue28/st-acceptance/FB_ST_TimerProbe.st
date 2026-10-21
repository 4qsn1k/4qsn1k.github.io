// TEST ONLY. Stage 0 vendor syntax/timer probe; no physical I/O assignment.
FUNCTION_BLOCK FB_ST_TimerProbe

VAR_INPUT
  ENABLE : BOOL;
END_VAR

VAR_OUTPUT
  DONE : BOOL;
  FRESH_RISE : BOOL;
  RISE_COUNT : UDINT;
END_VAR

VAR
  Delay : SYS.TON;
  LowSeen : BOOL := FALSE;
  Previous : BOOL := TRUE;
  Count : UDINT := 0;
END_VAR

// SYS.TON must be called on every scan, including FALSE input scans.
Delay(I := ENABLE, T := T#10s);
DONE := Delay.Q;

// Startup HIGH is not a fresh request. A real LOW scan arms detection.
FRESH_RISE := LowSeen AND ENABLE AND NOT Previous;
IF NOT ENABLE THEN LowSeen := TRUE; END_IF;
IF FRESH_RISE THEN Count := Count + 1; END_IF;
Previous := ENABLE;
RISE_COUNT := Count;

END_FUNCTION_BLOCK
