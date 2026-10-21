// Issue #28. TEST ONLY. ST_NATIVE_NOT_VERIFIED until vendor acceptance.
// Logical simulator signals only; no physical terminals or lock-power wiring.
// One instance, called once each scan. No retained variables.
FUNCTION_BLOCK FB_Airlock2

VAR_INPUT
  CLOSED_A : BOOL;
  CLOSED_B : BOOL;
  REQUEST_A : BOOL;
  REQUEST_B : BOOL;
  FIRE_NORMAL : BOOL;
  RESET : BOOL;
  DATA_HEALTHY : BOOL;
END_VAR

VAR_OUTPUT
  PERMIT_A : BOOL;
  PERMIT_B : BOOL;
  BUZZER : BOOL;
  FAULT : BOOL;
  READY : BOOL;
  RESERVED_A : BOOL;
  RESERVED_B : BOOL;
  OVERTIME_A : BOOL;
  OVERTIME_B : BOOL;
  EMERGENCY : BOOL;
  STATE_CODE : UDINT;
END_VAR

VAR
  // 0=HOLD, 10=READY, 20=GRANT_A, 21=OPEN_A,
  // 30=GRANT_B, 31=OPEN_B, 90=INHIBITED.
  State : UDINT := 0;
  FaultLatch : BOOL := FALSE;
  RecoveryLatch : BOOL := FALSE;
  // TRUE at startup consumes requests/reset already held HIGH.
  PreviousA : BOOL := TRUE;
  PreviousB : BOOL := TRUE;
  PreviousReset : BOOL := TRUE;
  FreshA : BOOL;
  FreshB : BOOL;
  FreshReset : BOOL;
  AllClosed : BOOL;
  Normal : BOOL;
  RecoveryAccepted : BOOL;
  HoldTimer : SYS.TON;
  GrantTimer : SYS.TON;
  OpenTimerA : SYS.TON;
  OpenTimerB : SYS.TON;
END_VAR

FreshA := REQUEST_A AND NOT PreviousA;
FreshB := REQUEST_B AND NOT PreviousB;
FreshReset := RESET AND NOT PreviousReset;
AllClosed := CLOSED_A AND CLOSED_B;
RecoveryAccepted := FALSE;

// Current unsafe inputs dominate even a simultaneous Reset.
IF NOT CLOSED_A AND NOT CLOSED_B THEN
  FaultLatch := TRUE;
END_IF;
IF NOT FIRE_NORMAL OR NOT DATA_HEALTHY THEN
  RecoveryLatch := TRUE;
END_IF;
IF (State <> 0) AND (State <> 10) AND (State <> 20) AND
   (State <> 21) AND (State <> 30) AND (State <> 31) AND
   (State <> 90) THEN
  FaultLatch := TRUE;
END_IF;

IF (FaultLatch OR RecoveryLatch) AND FreshReset AND
   FIRE_NORMAL AND DATA_HEALTHY AND AllClosed AND
   NOT REQUEST_A AND NOT REQUEST_B THEN
  FaultLatch := FALSE;
  RecoveryLatch := FALSE;
  RecoveryAccepted := TRUE;
END_IF;

Normal := FIRE_NORMAL AND DATA_HEALTHY AND
          NOT FaultLatch AND NOT RecoveryLatch;

// Every timer runs exactly once each scan, including its FALSE/reset path.
// Reservation alone does not restart dwell. Opening always resets dwell.
// Successful recovery forces one FALSE scan, then a fresh full 10 seconds.
HoldTimer(I := AllClosed AND Normal AND NOT RecoveryAccepted, T := T#10s);
OpenTimerA(I := NOT CLOSED_A, T := T#30s);
OpenTimerB(I := NOT CLOSED_B, T := T#30s);

// Exactly one transition per scan; outputs use the committed state below.
IF NOT Normal THEN
  State := 90;
ELSIF RecoveryAccepted THEN
  State := 0;
ELSE
  CASE State OF
    0:
      IF HoldTimer.Q THEN
        // Accept a fresh edge at the dwell boundary without an extra scan.
        IF FreshA THEN State := 20;
        ELSIF FreshB THEN State := 30;
        ELSE State := 10;
        END_IF;
      END_IF;
    10:
      IF NOT AllClosed THEN State := 0;
      ELSIF FreshA THEN State := 20;
      ELSIF FreshB THEN State := 30;
      END_IF;
    20:
      // Observed opening wins over release/expiry in this same scan.
      IF NOT CLOSED_A THEN State := 21;
      ELSIF NOT AllClosed THEN State := 0;
      ELSIF NOT REQUEST_A OR GrantTimer.Q THEN
        IF HoldTimer.Q THEN State := 10;
        ELSE State := 0;
        END_IF;
      END_IF;
    21:
      IF CLOSED_A THEN State := 0; END_IF;
    30:
      IF NOT CLOSED_B THEN State := 31;
      ELSIF NOT AllClosed THEN State := 0;
      ELSIF NOT REQUEST_B OR GrantTimer.Q THEN
        IF HoldTimer.Q THEN State := 10;
        ELSE State := 0;
        END_IF;
      END_IF;
    31:
      IF CLOSED_B THEN State := 0; END_IF;
    90:
      // Recovery must pass the explicit fresh-Reset gate above.
      FaultLatch := TRUE;
      State := 90;
    ELSE
      FaultLatch := TRUE;
      State := 90;
  END_CASE;
END_IF;

// Start the 5s TEST window on the granting scan, not the following scan.
// Its current Q cuts PERMIT immediately; state cleanup follows next scan.
GrantTimer(I := ((State = 20) OR (State = 30)) AND AllClosed AND Normal, T := T#5s);

FAULT := FaultLatch OR RecoveryLatch;
PERMIT_A := Normal AND NOT FAULT AND (State = 20) AND AllClosed AND
            REQUEST_A AND NOT GrantTimer.Q;
PERMIT_B := Normal AND NOT FAULT AND (State = 30) AND AllClosed AND
            REQUEST_B AND NOT GrantTimer.Q;
RESERVED_A := Normal AND ((State = 20) OR (State = 21));
RESERVED_B := Normal AND ((State = 30) OR (State = 31));
READY := Normal AND NOT FAULT AND HoldTimer.Q;
OVERTIME_A := OpenTimerA.Q;
OVERTIME_B := OpenTimerB.Q;
BUZZER := FAULT OR OVERTIME_A OR OVERTIME_B;
EMERGENCY := NOT FIRE_NORMAL;
STATE_CODE := State;

// Update even in HOLD/INHIBITED: denied edges are consumed, never queued.
PreviousA := REQUEST_A;
PreviousB := REQUEST_B;
PreviousReset := RESET;

END_FUNCTION_BLOCK
