"use strict";
const causes=new Set(["NOT_POLLED","STALE","NO_BINDINGS","INCOMPLETE_SAMPLE","INVALID_SAMPLE","POLL_DEADLINE","STOPPED","QUEUE_FULL","QUEUE_TIMEOUT","BUS_BUSY","BUS_CONFIG","RTU_TIMEOUT","RTU_PROTOCOL","RTU_UNAVAILABLE","RTU_WORKER","TCP_TIMEOUT","TCP_PROTOCOL","TCP_UNAVAILABLE","PORT_RELEASED","PORT_RELEASE_PENDING","PORT_RELEASE_TIMEOUT","PORT_RELEASE_UNCONFIRMED","UNKNOWN_PORT","READ_FAILED"]);
function fault(code){const error=Error(causes.has(code)?code:"READ_FAILED");error.code=error.message;return error;}
function cause(error){
 if(causes.has(error?.code))return error.code;
 // Exception numbers contain no device topology or library diagnostics.
 if(/^MODBUS_EXCEPTION_[0-9]{1,3}$/.test(error?.code||""))return error.code;
 return "READ_FAILED";
}
module.exports={fault,cause};
