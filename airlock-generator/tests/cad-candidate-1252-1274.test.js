"use strict";
// The CAD crop does not contain a verified door/zone inventory.
// This test prevents accidental treatment of the image inventory as
// a completed controller-program model.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname,"..");
const data = JSON.parse(fs.readFileSync(path.join(root,"experimental/fixtures/real-cad-1252-1274-candidate.json"),"utf8"));
assert.equal(data.schema,"airlock-cad-candidate/1");
assert.equal(data.status,"DRAFT_NEEDS_OPERATOR_DOOR_AND_ZONE_CONFIRMATION");
assert.equal(data.outputSafety,"NOT_FOR_NATIVE_OWLE_GENERATION_OR_PLC");
assert.deepEqual(data.physicalSpaces.map(s=>s.number),["1252","1253","1254","1255","1256","1257","1274"]);
assert.deepEqual(data.physicalSpaces.map(s=>s.pressurePa),[50,37.5,37.5,25,25,12.5,null]);
assert.deepEqual(data.physicalDoors,[]);
assert.deepEqual(data.interlockZones,[]);
assert.deepEqual(data.controllerAssignments,[]);
assert.deepEqual(data.inputAssignments,[]);
assert.deepEqual(data.outputAssignments,[]);
assert.equal(data.designInvariants.onePhysicalReedPerDoor,true);
assert.equal(data.designInvariants.doorMayParticipateInTwoInterlockZones,true);
assert.equal(data.designInvariants.openingOnlyBlocksOtherDoorsInIncidentZones,true);
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,"fbd-generator.js"),"utf8"),context);
const builder = vm.runInContext("AirlockFbdGenerator",context);
assert.equal(typeof builder.build,"function");
assert.throws(()=>builder.build(data),/rooms\[\] and doors\[\]/);
console.log("CAD_CANDIDATE_INVENTORY_PASS 7_ROOMS 0_UNVERIFIED_DOORS NO_PLC_EXPORT");
