// TEST ONLY: generated logical interlock, no physical I/O binding.
// Fire release and egress require separate hardware circuit.
FUNCTION_BLOCK FB_Room_N1

VAR_INPUT
  FireNormal : BOOL;
  ResetFault : BOOL;
  I_D_1_2_Closed : BOOL;
  I_D_1_4_Closed : BOOL;
  I_D_1_5_Closed : BOOL;
END_VAR

VAR_OUTPUT
  O_Ready : BOOL;
  O_Red : BOOL;
  O_Green : BOOL;
  O_Fault : BOOL;
  O_Fire : BOOL;
  O_Alarm : BOOL;
  O_State : UDINT;
  O_D_1_2_Block : BOOL;
  O_D_1_4_Block : BOOL;
  O_D_1_5_Block : BOOL;
  O_D_1_2_Overtime : BOOL;
  O_D_1_4_Overtime : BOOL;
  O_D_1_5_Overtime : BOOL;
END_VAR

VAR
  State : UDINT := 0;
  AnyOpen : BOOL;
  AllClosed : BOOL;
  OpenCount : UDINT;
  FaultLatch : BOOL := FALSE;
  Close_D_1_2 : SYS.TON;
  Close_D_1_4 : SYS.TON;
  Close_D_1_5 : SYS.TON;
  Open_D_1_2 : SYS.TON;
  Open_D_1_4 : SYS.TON;
  Open_D_1_5 : SYS.TON;
  PurgeTimer : SYS.TON;
END_VAR

// Door opening is immediate; closing is confirmed after 80ms.
OpenCount := 0;
IF NOT I_D_1_2_Closed THEN OpenCount := OpenCount + 1; END_IF;
IF NOT I_D_1_4_Closed THEN OpenCount := OpenCount + 1; END_IF;
IF NOT I_D_1_5_Closed THEN OpenCount := OpenCount + 1; END_IF;
AnyOpen := (OpenCount > 0);
Close_D_1_2(I := I_D_1_2_Closed, T := T#80ms);
Close_D_1_4(I := I_D_1_4_Closed, T := T#80ms);
Close_D_1_5(I := I_D_1_5_Closed, T := T#80ms);
AllClosed := Close_D_1_2.Q AND Close_D_1_4.Q AND Close_D_1_5.Q;
Open_D_1_2(I := NOT I_D_1_2_Closed AND FireNormal, T := T#30s);
Open_D_1_4(I := NOT I_D_1_4_Closed AND FireNormal, T := T#30s);
Open_D_1_5(I := NOT I_D_1_5_Closed AND FireNormal, T := T#30s);
PurgeTimer(I := (State = 30) AND AllClosed AND FireNormal AND NOT FaultLatch, T := T#30s);

IF OpenCount > 1 THEN FaultLatch := TRUE; END_IF;
IF ResetFault AND AllClosed AND FireNormal THEN
  FaultLatch := FALSE;
  State := 0;
END_IF;

IF NOT FireNormal THEN
  State := 99;
ELSIF FaultLatch THEN
  State := 90;
ELSE
  CASE State OF
    0:
      IF AnyOpen THEN State := 20;
      ELSIF AllClosed THEN State := 30;
      END_IF;
    10:
      IF AnyOpen THEN State := 20; END_IF;
    20:
      IF AllClosed THEN State := 30; END_IF;
    30:
      IF AnyOpen THEN State := 20;
      ELSIF PurgeTimer.Q THEN State := 10;
      END_IF;
    90: State := 0;
    99: State := 0;
    ELSE State := 0;
  END_CASE;
END_IF;

O_Ready := FireNormal AND (State = 10) AND NOT FaultLatch;
O_Green := O_Ready;
O_Red := FireNormal AND NOT O_Ready;
O_Fault := FaultLatch;
O_Fire := NOT FireNormal;
O_State := State;
O_D_1_2_Overtime := Open_D_1_2.Q;
O_D_1_4_Overtime := Open_D_1_4.Q;
O_D_1_5_Overtime := Open_D_1_5.Q;
O_Alarm := O_D_1_2_Overtime OR O_D_1_4_Overtime OR O_D_1_5_Overtime;
O_D_1_2_Block := FireNormal AND (NOT O_Ready) AND ((State <> 20) OR I_D_1_2_Closed);
O_D_1_4_Block := FireNormal AND (NOT O_Ready) AND ((State <> 20) OR I_D_1_4_Closed);
O_D_1_5_Block := FireNormal AND (NOT O_Ready) AND ((State <> 20) OR I_D_1_5_Closed);

END_FUNCTION_BLOCK
