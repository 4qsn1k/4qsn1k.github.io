FUNCTION_BLOCK functionblock1

VAR_INPUT
    DI1 : BOOL; // CNC door: 1 = closed
    DI2 : BOOL; // D door: 1 = closed
    DI3 : BOOL; // Fire: 1 = normal
END_VAR

VAR_OUTPUT
    DO1 : BOOL; // Lock D
    DO2 : BOOL; // Red lights
    DO3 : BOOL; // Buzzer
    DO4 : BOOL; // BUSY
    StateCode : UDINT;
END_VAR

VAR
    State : UDINT := 0;
    AnyOpen : BOOL;
    BothClosed : BOOL;
    FilterA : SYS.TON;
    FilterB : SYS.TON;
    TimerOpenA : SYS.TON;
    TimerOpenB : SYS.TON;
    TimerPurge : SYS.TON;
END_VAR

// STATES: 0 START, 10 READY, 20 DOOR OPEN, 30 PURGE, 99 FIRE

AnyOpen := NOT DI1 OR NOT DI2;

FilterA(I := DI1, T := T#80ms);
FilterB(I := DI2, T := T#80ms);
BothClosed := FilterA.Q AND FilterB.Q;

TimerOpenA(I := NOT DI1 AND DI3, T := T#30s);
TimerOpenB(I := NOT DI2 AND DI3, T := T#30s);
TimerPurge(I := (State = 30) AND BothClosed AND DI3, T := T#30s);

IF NOT DI3 THEN
    State := 99;
ELSE
    CASE State OF
        0: // START
            IF AnyOpen THEN
                State := 20;
            ELSIF BothClosed THEN
                State := 30;
            END_IF;
        10: // READY
            IF AnyOpen THEN
                State := 20;
            END_IF;
        20: // DOOR OPEN
            IF BothClosed THEN
                State := 30;
            END_IF;
        30: // PURGE
            IF AnyOpen THEN
                State := 20;
            ELSIF TimerPurge.Q THEN
                State := 10;
            END_IF;
        99: // FIRE RECOVERY
            IF AnyOpen THEN
                State := 20;
            ELSE
                State := 0;
            END_IF;
        ELSE
            State := 0;
    END_CASE;
END_IF;

DO1 := DI3 AND (State <> 10);
DO4 := DI3 AND (State <> 10);
DO2 := (State <> 10);
DO3 := DI3 AND (TimerOpenA.Q OR TimerOpenB.Q);
StateCode := State;

END_FUNCTION_BLOCK
