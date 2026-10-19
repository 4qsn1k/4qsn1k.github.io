"use strict";
// Genuine Owen Logic editor save/diff evidence from an existing TEST clone.
// This is NOT a native OWLE serializer, software acceptance of new graphs,
// or evidence of physical PLC/relay tests.
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const fixturePath=path.join(__dirname,"..","experimental","fixtures","owle-qa012-editor-geometry-delta.json");
const raw=fs.readFileSync(fixturePath,"utf8"),data=JSON.parse(raw);
assert.equal(data.schema,"airlock-owle-gui-geometry-diff/1");
assert.match(data.scope,/TEST_CLONE_ONLY/);
assert.deepEqual(data.counts,{elements:25,ports:64,connectors:16,stDefinitions:3});
assert.deepEqual(data.identityPreserved,{elements:true,ports:true,connectors:true});
assert.equal(data.stDefinitionsSemanticallyUnchanged,true);
assert.deepEqual(data.archiveMembers,["Project","StFunctionBlocks"]);
assert.equal(data.change.nativeElement,"I1");
assert.deepEqual(data.change.nativeDelta,{x:0,y:2.5});
assert.deepEqual(data.change.locationBefore,{isEmpty:true,x:0,y:0});
assert.deepEqual(data.change.locationAfter,{isEmpty:false,x:0,y:2.5});
assert.equal(data.change.affectedEdges.length,2);
const edgeByName=Object.fromEntries(data.change.affectedEdges.map(e=>[e.to,e]));
assert.equal(Object.keys(edgeByName).length,2);
const a=edgeByName["FB_Room_N4.Input0"],b=edgeByName["FB_Room_N1.Input0"];
assert(a&&b);assert.equal(a.from,"I1.Output0");assert.equal(b.from,"I1.Output0");
assert.deepEqual(a.before,[{x:12.5,y:5},{x:152.5,y:5},{x:152.5,y:135}]);
assert.deepEqual(a.after,[{x:12.5,y:7.5},{x:152.5,y:7.5},{x:152.5,y:135}]);
assert.deepEqual(b.before,[{x:12.5,y:5},{x:22.499996,y:5},{x:22.499996,y:7.500004}]);
assert.deepEqual(b.after,[{x:12.5,y:7.5},{x:22.499996,y:7.500004}]);
for(const e of [a,b])assert.equal(e.after[0].y-e.before[0].y,2.5);
assert.equal(data.guiEvidence.opened,true);
assert.equal(data.guiEvidence.simulationRan,true);
assert.equal(data.guiEvidence.roomN1StateBefore,99);
assert.equal(data.guiEvidence.roomN1StateAfter,90);
assert.equal(data.guiEvidence.roomN1FaultAfter,1);
assert.equal(data.guiEvidence.savedUsingOwenLogic,true);
assert.equal(data.guiEvidence.reopenedSavedClone,true);
assert.equal(data.guiEvidence.reopenedSavedCloneSimulationRan,true);
assert.equal(data.guiEvidence.reopenedCloneInputI1After,1);
assert.equal(data.guiEvidence.reopenedCloneRoomN1StateAfter,90);
assert.equal(data.guiEvidence.reopenedCloneFaultAfter,1);
assert.equal(data.guiEvidence.reopenedCloneSha256,data.afterSha256);
assert.equal(data.guiEvidence.reopenedFileNotModifiedDuringSimulation,true);
assert.deepEqual(data.disclaimers,{
 rawNativeArchivePublished:false,sourceStPublished:false,
 arbitraryNativeSerializationConfirmed:false,compilerDiagnosticsIndependentlyCaptured:false,
 physicalPLCUsed:false
});
assert(!/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i.test(raw));
assert(!/FUNCTION_BLOCK|VAR_INPUT|END_FUNCTION_BLOCK/i.test(raw));
console.log("OWLE_NATIVE_GUI_GEOMETRY_DIFF_FIXTURE_PASS; existing cloned TEST only, arbitrary writer unverified");
