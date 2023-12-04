// sigmlStringToBML translate from a sigml (xml) string (valid in jasigning) to a bml. It is an approximate solution.

// missing location_hand (and handconstellation)
// missing rpt_motion
// non manual features parser system already implemented. Missing several non manual features tables 


/* 

AFPAKKEN
AANPASSEN
AANTAL
BABYSITTEN
AARDAPPELPUREE
*/


const TIMESLOT ={
    DEF: 0.5,

    NMFSTARTPEAK: 0.25,
    NMFWAIT: 0.25,
    NMFRELAXEND: 0.25,

    POSTURE: 0.3,
    LOC: 0.3,
    HAND: 0.3,

    MOTION: 0.5,
    MOTIONDIR : 0.3,
    MOTIONCIRC : 0.5,

    REST: 0.3, // rest attributes of some motions
    RELAXEND: 0.5, // after the sign, the time it takes to return to neutral pose
    PEAKRELAX: 0.5, // after the last posture is executed, the time it stays in that pose (instead of moving the arm and immediately returning to neutral pose)
}

window.TIMESLOTS = TIMESLOT;


function sigmlStringToBML( str, timeOffset = 0 ) {
    let parser = new DOMParser();
    let xmlDoc = null;

    let msg = [];
    timeOffset = (isNaN(timeOffset)) ? 0 : timeOffset;
    let time = timeOffset;
    try{
        xmlDoc = parser.parseFromString( str, "text/xml" ).children[0];
    }catch( error ){
        return { data: [], duration: 0, relaxEndDuration: 0 };
    }

    let lastRelaxEndDuration = 0
    let lastPeakRelaxDuration = 0;
    let isFirstValidSign = true;
    // for each hamnosis sign
    for( let i = 0; i < xmlDoc.children.length ; ++i ){
        if( xmlDoc.children[i].tagName != "hns_sign" && xmlDoc.children[i].tagName != "hamgestural_sign" ){ continue; }
        
        time = time - lastRelaxEndDuration - lastPeakRelaxDuration + 0.2; // if not last, remove relax-end stage and partially remove the peak-relax 
        if( isFirstValidSign ){ time -= 0.2; }
        let result = hnsSignParser( xmlDoc.children[i], time );
        time = result.end;
        msg = msg.concat( result.data );
        lastRelaxEndDuration = result.relaxEndDuration;
        lastPeakRelaxDuration = result.peakRelaxDuration;
    }

    return { data: msg, duration: ( time - timeOffset ), relaxEndDuration: lastRelaxEndDuration, peakRelaxDuration: lastPeakRelaxDuration };
}


function hnsSignParser( xml, start ){
    let result = [];
    let end = start;
    let relaxEndDuration = 0;
    let peakRelaxDuration = 0;

    // parse xml attributes
    let attributes = {}
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }
    let signSpeed = parseFloat( attributes.speed ); 
    signSpeed = ( isNaN( signSpeed ) ) ? 1 : signSpeed;

    let resultManual = null;
    let resultNonManual = null;
    for ( let i = 0; i < xml.children.length; ++i ){
        if ( !resultNonManual && xml.children[i].tagName == "sign_nonmanual" ){
            resultNonManual = signNonManual( xml.children[i], start, signSpeed );
            if (end < resultNonManual.end ){ end = resultNonManual.end; }
        }
        if ( !resultManual && xml.children[i].tagName == "sign_manual" ){
            resultManual = signManual( xml.children[i], start, signSpeed );
            peakRelaxDuration = resultManual.peakRelaxDuration;
            relaxEndDuration = resultManual.relaxEndDuration;
            if (end < resultManual.end ){ end = resultManual.end; }

        }
    }

    if ( resultManual ){ result = result.concat( resultManual.data ); }
    if ( resultNonManual ){ result = result.concat( resultNonManual.data ); }
    if ( attributes.gloss ){ result.unshift( { gloss: attributes.gloss } ); }
    
    return { data: result, end: end, relaxEndDuration: relaxEndDuration, peakRelaxDuration: peakRelaxDuration }; 
}


// ###############################################
// #                Manual Parser                #
// ###############################################


let simpleMotionAvailable = [ "directedmotion", "circularmotion", "wristmotion", "crossmotion", "fingerplay", "changeposture", "nomotion" ]; // crossmotion deprecated
let motionsAvailable = simpleMotionAvailable.concat( [ "nonman_motion", "par_motion", "seq_motion", "split_motion", "rpt_motion", "tgt_motion" ] ); // missing tgt, rpt and timing issues
let posturesAvailable = [ "handconfig", "split_handconfig", "location_bodyarm", "split_location", "location_hand", "handconstellation" , "use_locname"]; // missing location_hand, handconstellation, use_locname(????) 

function checkHandsUsage( orders ){
    
    let hand = "RIGHT";
    let result = {};

    while( true ){
        let handResult = {
            isHandUsed: false,
            firstHandUsage: 9999999999999,
            firstLocationBody: 9999999999999,
            usage: [ false, false, false, false ], // location, extfidir, palmor, handshape
        };
        if ( !orders ){ orders = []; }
      
        for ( let i = 0; i < orders.length; ++i ){
            if ( orders[i].hand != "BOTH" && orders[i].hand != hand ){ continue; }
            handResult.isHandUsed = true;
            let o = orders[i];
            if ( o.start < handResult.firstHandUsage && !o.locationBodyArm ){ handResult.firstHandUsage = o.start; }
            if ( o.start < handResult.firstLocationBody && o.locationBodyArm ){ handResult.firstLocationBody = o.start; }

            if ( o.locationBodyArm || o.handConstellation ){ handResult.usage[0] = true; }
            if ( o.extfidir ){ handResult.usage[1] = true; }
            if ( o.palmor ){ handResult.usage[2] = true; }
            if ( o.handshape ){ handResult.usage[3] = true; }
        }

        result[ hand ] = handResult;
        if ( hand == "RIGHT" ){ hand = "LEFT"; }
        else{ break; }
    }

    return result;

}

// this function and structure is only needed because rpt_motion needs to know the src pose to witch return during repetitions
function currentPostureUpdate( oldPosture, newOrders, overwrite = false ){
    let newPosture;
    if ( !oldPosture ){
        newPosture = {
            RIGHT: [
                { type: "gesture", start: -1, locationBodyArm: "CHEST", secondLocationBodyArm: "STOMACH", hand: "RIGHT", distance: 0.37, side: "r", srcContact: "HAND_PALMAR" },
                { type: "gesture", start: -1, extfidir: "dl", hand: "RIGHT" }, 
                { type: "gesture", start: -1, palmor: "l", hand: "RIGHT" }, 
                { type: "gesture", start: -1, handshape: "FLAT", thumbshape: "TOUCH", hand: "RIGHT" }, 
            ],
            LEFT: [
                { type: "gesture", start: -1, locationBodyArm: "CHEST", secondLocationBodyArm: "STOMACH", hand: "LEFT", distance: 0.37, side: "l", srcContact: "HAND_PALMAR" },
                { type: "gesture", start: -1, extfidir: "dr", hand: "LEFT" }, 
                { type: "gesture", start: -1, palmor: "r", hand: "LEFT" }, 
                { type: "gesture", start: -1, handshape: "FLAT", thumbshape: "TOUCH", hand: "LEFT" }, 
            ],
            handConstellation: null,
        }
    }
    else if ( overwrite ){ newPosture = oldPosture; }
    else { newPosture = JSON.parse( JSON.stringify( oldPosture ) ); }

    // check all new orders
    let hand = "RIGHT";
    while( true ){

        for( let i = 0; i < newOrders.length; ++i ){
            let o = newOrders[i];
            let type = -1;
            if ( o.locationBodyArm ){ type = 0; }
            else if ( o.extfidir ){ type = 1; }
            else if ( o.palmor ){ type = 2; }
            else if ( o.handshape ){ type = 3; }
            else if ( o.handConstellation ){ type = 4; }
    
            // if a new order has a bigger start than the old posture, it becomes the new posture
            if( type > -1 && type < 4 ){
                if ( ( o.hand == hand || o.hand == "BOTH" ) && newPosture[ hand ][ type ].start < o.start ){
                    newPosture[ hand ][ type ] = JSON.parse( JSON.stringify( o ) ); // copy object, not reference
                    newPosture[ hand ][ type ].hand = hand;
                    delete newPosture[ hand ][ type ].attackPeak; // just in case
                    delete newPosture[ hand ][ type ].relax;
                    delete newPosture[ hand ][ type ].end;
                }
            }
            else if ( type == 4 ){
                if ( !newPosture.handConstellation || newPosture.handConstellation.start < o.start ){
                    newPosture.handConstellation = JSON.parse( JSON.stringify( o ) ); // copy object, not reference
                    delete newPosture.handConstellation.attackPeak; // just in case
                    delete newPosture.handConstellation.relax;
                    delete newPosture.handConstellation.end;
                }
    
            }
        }

        if ( hand == "RIGHT" ){ hand = "LEFT"; }
        else{ break; }
    }


    return newPosture;
}

// missing location_hand (and handconstellation), motions except simpleMotion
function signManual( xml, start, signSpeed ){
    let result = [];
    let time = start;
    let actions = xml.children;
    if ( !actions.length ){ return { data: [], end: start, peakRelaxDuration: 0, relaxEndDuration: 0 }; }

    // parse xml attributes
    let attributes = {}
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }
    
    const signGeneralInfo = {
        domHand: "RIGHT",
        nonDomHand: "LEFT",
        bothHands: false,
        symmetry: 0x00,
        outofphase: false,
    };
    signGeneralInfo.bothHands = attributes.both_hands == "true";
    if ( !signGeneralInfo.bothHands && attributes.nondominant == "true" ){ signGeneralInfo.domHand = "LEFT"; }
    signGeneralInfo.nonDomHand = signGeneralInfo.domHand == "RIGHT" ? "LEFT" : "RIGHT";
    let lrSym = attributes.lr_symm == "true";
    let oiSym = attributes.oi_symm == "true";
    let udSym = attributes.ud_symm == "true";
    signGeneralInfo.symmetry = lrSym | ( udSym << 1 ) | ( oiSym << 2 );
    signGeneralInfo.outofphase = attributes.outofphase == "true";

    let motionsStarted = false; // (JASIGNING) when motion instructions start, no handconfig or location are taken into account. Also time starts adding

    result.push( { type: "gesture", config: { dominant: signGeneralInfo.domHand } } );
    let currentPosture = currentPostureUpdate( null, [] );

    // Mode 1: several <sign_manual> inside a <sign_manual>. Modes 1 and 2 cannot coexist. Either one or the other
    if ( actions[0].tagName == "sign_manual" ){
        let peakRelaxDuration = 0;
        let relaxEndDuration = 0;
        for ( let i = 0; i < actions.length; ++i ){
            let action = actions[i];
            let tagName = actions[i].tagName;
    
            // some sigml signs have several sign_manual inside
            if ( tagName == "sign_manual" ){
                time = time - peakRelaxDuration * 0.8 - relaxEndDuration;
                let r = signManual( action, time, signSpeed );
                result = result.concat( r.data );
                peakRelaxDuration = r.peakRelaxDuration;
                relaxEndDuration = r.relaxEndDuration;
                if ( time < r.end ) { time = r.end; }
            }
        }
        return { data: result, end: time, peakRelaxDuration: peakRelaxDuration, relaxEndDuration: relaxEndDuration };

    }
    
    // Mode 2: instructions only. Modes 1 and 2 cannot coexist. Either one or the other
    for ( let i = 0; i < actions.length; ++i ){
        let action = actions[i];
        let tagName = actions[i].tagName;

        if ( !motionsStarted ){
            if ( posturesAvailable.includes( tagName ) ){
                let r = postureParser( action, time, signGeneralInfo.bothHands ? "BOTH" : signGeneralInfo.domHand, signGeneralInfo.symmetry, signSpeed, signGeneralInfo, currentPosture );
                result = result.concat( r.data );
                currentPosture = currentPostureUpdate( currentPosture, r.data ); // needed for location_hand in locatoin_bodyarm...
                // do not advance time. All postures should happen at the same time
            }
        }
        if ( motionsAvailable.includes( tagName ) ){
            if( !motionsStarted && result.length > 1 ){ 
                time += TIMESLOT.LOC / signSpeed; 
            }
            motionsStarted = true; // locations and handconfigs will no longer be accepted for this sign
            let r = motionParser( action, time, signGeneralInfo.bothHands ? "BOTH" : signGeneralInfo.domHand, signGeneralInfo.symmetry, signSpeed, signGeneralInfo, currentPosture );
            result = result.concat( r.data );
            if ( time < r.end ) { time = r.end; }
            currentPosture = currentPostureUpdate( currentPosture, r.data );
        }
    }
    // no motions were inserted, but a location was
    if ( !motionsStarted && result.length > 1 ){
        time += TIMESLOT.LOC / signSpeed; 
    }

    // add default locations if necessary ( add to the beginning of array to avoid location cancelling any handconstellation or whatever)
    let checkHandsResult = checkHandsUsage( result );
    if ( checkHandsResult["RIGHT"].isHandUsed ){
        if ( checkHandsResult["RIGHT"].firstHandUsage + 0.05 < checkHandsResult["RIGHT"].firstLocationBody ){ 
            result.unshift( { type: "gesture",  start:start - 0.0001, attackPeak:start + TIMESLOT.LOC / signSpeed, locationBodyArm: "CHEST", secondLocationBodyArm: "STOMACH", hand: "RIGHT", distance: 0.37, side: "r", srcContact: "HAND_PALMAR" } );
        }
    }
    if ( checkHandsResult["LEFT"].isHandUsed ){
        if ( checkHandsResult["LEFT"].firstHandUsage + 0.05 < checkHandsResult["LEFT"].firstLocationBody ){ 
            result.unshift( { type: "gesture",  start:start - 0.0001, attackPeak:start + TIMESLOT.LOC / signSpeed, locationBodyArm: "CHEST", secondLocationBodyArm: "STOMACH", hand: "LEFT", distance: 0.37, side: "l", srcContact: "HAND_PALMAR" } );
        }
    }


    let peakRelaxDuration = TIMESLOT.PEAKRELAX; //TIMESLOT.PEAKRELAX / signSpeed; // add an extra time for all ending instrunctions' attackPeak-realx stage
    time += peakRelaxDuration;

    // these actions should last for the entirety of the sign. If there is a change mid sign, the new will overwrite the previous, so no problem with conflicting ends 
    for ( let i = 0; i < result.length; ++i ){
        if ( result[i].extfidir || result[i].palmor || result[i].handshape || result[i].locationBodyArm || result[i].handConstellation ){ 
            if ( isNaN( result[i].relax ) ){ result[i].relax = time; }
            if ( isNaN( result[i].end ) ){ result[i].end = time + TIMESLOT.RELAXEND; } //TIMESLOT.RELAXEND / signSpeed; }
        }
        if ( result[i].motion == "directed" || result[i].motion == "circular" ){ // circular mainly when it is not a 2*PI rotation  
            // result[i].attackPeak = result[i].start + TIMESLOT.MOTIONDIR;
            if ( isNaN( result[i].relax ) ){ result[i].relax = time; }
            if ( isNaN( result[i].end ) ){ result[i].end = time + TIMESLOT.RELAXEND; } //TIMESLOT.RELAXEND / signSpeed; }
        }
        if ( result[i].motion == "wrist" || result[i].motion == "fingerplay" ){ 
            let dt = 0.15 * ( result[i].end - result[i].start );
            result[i].attackPeak = result[i].start + ( ( dt < 0.15 ) ? dt : 0.15 ); // entry not higher than 150 ms
            result[i].relax = result[i].end - ( ( dt < 0.15 ) ? dt : 0.15 ) ;
        }
    }

    let relaxEndDuration = TIMESLOT.RELAXEND;// TIMESLOT.RELAXEND / signSpeed; // add an extra time for all ending instructions relax-end
    time += relaxEndDuration;

    
    return { data: result, end: time, peakRelaxDuration: peakRelaxDuration, relaxEndDuration: relaxEndDuration };
}

function postureParser( xml, start, hand, symmetry, signSpeed, signGeneralInfo, currentPosture = null ){
    // shape of pose until the end of the sign or a tgt motion
    let result = [];
    let tagName = xml.tagName;
    let maxEnd = 0;
    let time = start;

    if ( tagName == "handconfig" ){
        result = result.concat( handconfigParser( xml, time, time + TIMESLOT.HAND / signSpeed, hand, symmetry, signGeneralInfo ) );
        maxEnd = TIMESLOT.HAND / signSpeed;
    }  
    else if ( tagName == "split_handconfig" ){ // split instruction removes any symmetry. Both_hands attribute does not matter
        if ( xml.children.length > 0 && xml.children[0].tagName == "handconfig" ){
            result = result.concat( handconfigParser( xml.children[0], time, time + TIMESLOT.HAND / signSpeed, signGeneralInfo.domHand, 0x00, signGeneralInfo ) );
            maxEnd = TIMESLOT.HAND / signSpeed;
        }
        if ( xml.children.length > 1 && xml.children[1].tagName == "handconfig" ){
            result = result.concat( handconfigParser( xml.children[1], time, time + TIMESLOT.HAND / signSpeed, signGeneralInfo.nonDomHand, 0x00, signGeneralInfo ) );
            maxEnd = TIMESLOT.HAND / signSpeed;
        }
    }
    
    else if ( tagName == "location_bodyarm" ){ 
        result = result.concat( locationBodyArmParser( xml, time, time + TIMESLOT.LOC / signSpeed, hand, symmetry, signGeneralInfo, currentPosture ) );
        maxEnd = TIMESLOT.LOC / signSpeed;
    }
    else if ( tagName == "split_location" ){ // can be location_hand or location_bodyarm. // split instruction removes any symmetry.  Both_hands attribute does not matter
        // first check bodyarm locations, as these has cancel out any previous handconstellation in bml 
        if ( xml.children.length > 0 && xml.children[0].tagName == "location_bodyarm" ){
            result = result.concat( locationBodyArmParser( xml.children[0], time -0.000001, time + TIMESLOT.LOC / signSpeed, signGeneralInfo.domHand, 0x00, signGeneralInfo, currentPosture ) );
            maxEnd = TIMESLOT.LOC / signSpeed;
        }
        if ( xml.children.length > 1 && xml.children[1].tagName == "location_bodyarm" ){
            result = result.concat( locationBodyArmParser( xml.children[1], time -0.000001, time + TIMESLOT.LOC / signSpeed, signGeneralInfo.nonDomHand, 0x00, signGeneralInfo, currentPosture ) );
            maxEnd = TIMESLOT.LOC / signSpeed;
        }

        // check if there is any location hand
        let domChild = null;
        let nonDomChild = null;
        if ( xml.children.length > 0 && xml.children[0].tagName == "location_hand" ){ domChild = locationHandInfoExtract( xml.children[0], true ); }
        if ( xml.children.length > 1 && xml.children[1].tagName == "location_hand" ){ nonDomChild = locationHandInfoExtract( xml.children[1], true ); }

        if ( domChild || nonDomChild ){
            let handConstellation = { type: "gesture", start: time, attackPeak: time + TIMESLOT.LOC / signSpeed, handConstellation:"true" };

            // each location hand specifies where to touch in the OTHER hand 
            if ( domChild && nonDomChild ){ 
                handConstellation.hand = "BOTH";
                handConstellation.dstLocation = domChild.location;
                handConstellation.dstSide = domChild.side;
                handConstellation.dstFinger = domChild.finger;
                handConstellation.srcLocation = nonDomChild.location;
                handConstellation.srcSide = nonDomChild.side;
                handConstellation.srcFinger = nonDomChild.finger;
            }else{ // only one child is location_hand
                let filledChild = domChild ? domChild : nonDomChild;
                handConstellation.hand = domChild ? signGeneralInfo.domHand : signGeneralInfo.nonDomHand;

                handConstellation.dstLocation = filledChild.location;
                handConstellation.dstSide = filledChild.side;
                handConstellation.dstFinger = filledChild.finger;
                if ( filledChild.child ){
                    handConstellation.srcLocation = filledChild.child.location;
                    handConstellation.srcSide = filledChild.child.side;
                    handConstellation.srcFinger = filledChild.child.finger;
                }
            }

            result.push( handConstellation );
            maxEnd = TIMESLOT.LOC / signSpeed;
        }
    }
    else if ( tagName == "handconstellation" ){ 
        // <!ELEMENT  handconstellation  (  (location_hand, location_hand)?, location_bodyarm? )>
        result = result.concat( handConstellationParser( xml, time, time + TIMESLOT.LOC / signSpeed, hand, signGeneralInfo, currentPosture ) );
        if ( result.length > 0 ){ maxEnd = TIMESLOT.LOC / signSpeed; }

    } 
    else if ( tagName == "location_hand" ){
        result = result.concat( locationHandAsHandConstellationParser( xml, time, time + TIMESLOT.LOC / signSpeed, hand, signGeneralInfo, currentPosture ) );
        if ( result.length > 0 ){ maxEnd = TIMESLOT.LOC / signSpeed; }
    }

    return { data: result, end: ( start + maxEnd ) };
}
// in JaSigning the handconfig lasts until the end of the sign/gloss or until another instruction overwrites it
function handconfigParser( xml, start, attackPeak, hand, symmetry, signGeneralInfo ){
    let attributes = {}
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }

    let result = [];
    if ( attributes.handshape || attributes.thumbpos || attributes.bend1 || attributes.bend2 || attributes.bend3 || attributes.bend4 || attributes.bend5 || attributes.mainbend ){ 
        let obj = { type: "gesture", start: start, attackPeak: attackPeak, hand: hand };
        obj.handshape = attributes.handshape.toUpperCase().replace("FINGER", "FINGER_").replace("SPREAD", "_SPREAD").replace("PINCH", "PINCH_").replace("CEE", "CEE_").replace("OPEN", "_OPEN") || "FLAT";
        if ( attributes.second_handshape ){ obj.secondHandshape = attributes.second_handshape.toUpperCase().replace("FINGER", "FINGER_").replace("SPREAD", "_SPREAD").replace("PINCH", "PINCH_").replace("CEE", "CEE_").replace("OPEN", "_OPEN"); }
        if ( attributes.mainbend ) { obj.mainBend = attributes.mainbend.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.second_mainbend ) { obj.secondMainBend = attributes.second_mainbend.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.thumbpos ) { obj.thumbshape = attributes.thumbpos.toUpperCase(); }
        if ( attributes.second_thumbpos ) { obj.secondThumbshape = attributes.second_thumbpos.toUpperCase(); } 
        switch( attributes.ceeopening ){ 
            case "slack": obj.tco = 0.4; break;
            case "tight": obj.tco = -0.4; break;
            default: break;
        }
        switch( attributes.second_ceeopening ){ 
            case "slack": obj.secondtco = 0.4; break;
            case "tight": obj.secondtco = -0.4; break;
            default: break;
        }
        if ( attributes.bend1 ){ obj.bend1 = attributes.bend1.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.bend2 ){ obj.bend2 = attributes.bend2.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.bend3 ){ obj.bend3 = attributes.bend3.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.bend4 ){ obj.bend4 = attributes.bend4.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.bend5 ){ obj.bend5 = attributes.bend5.toUpperCase().replace("HALF", "HALF_").replace("DBL", "DOUBLE_"); }
        if ( attributes.specialfingers ){ obj.specialFingers = attributes.specialfingers; }

        result.push( obj );
    }
    if ( attributes.extfidir ){
        let obj = { type: "gesture", start: start, attackPeak: attackPeak, hand: hand };
        obj.extfidir = attributes.extfidir;
        if( attributes.second_extfidir ){ obj.secondExtfidir = attributes.second_extfidir; }
        if ( symmetry & 0x01 ){ obj.lrSym = true; }
        if ( symmetry & 0x02 ){ obj.udSym = true; }
        if ( symmetry & 0x04 ){ obj.oiSym = true; }
        result.push( obj );
    }
    if ( attributes.palmor ){
        let obj = { type: "gesture", start: start, attackPeak: attackPeak, hand: hand };

        if ( !attributes.palmor.match( /[l,r,u,d]/g ) ){ 
            if ( attributes.second_palmor && attributes.second_palmor.match( /[l,r,u,d]/g) ){ 
                obj.palmor = attributes.second_palmor;
            }else{
                obj.palmor = "dlll";
            }
        }else{
            obj.palmor = attributes.palmor;
            if ( attributes.second_palmor ){ obj.secondPalmor = attributes.second_palmor; }
        }

        if ( hand == "BOTH" && signGeneralInfo.bothHands ){ obj.lrSym = true; }
        else if ( symmetry & 0x01 ){ obj.lrSym = true; }  
        if ( symmetry & 0x02 ){ obj.udSym = true; }
        if ( symmetry & 0x04 ){ obj.oiSym = true; }
       
        result.push( obj );
    }
    return result;
}


let locationMapHead = {
    forehead: "FOREHEAD",
    eyebrows: "EYEBROW",
    eyes: "EYE",
    uppereyelid: "EYE",
    lowereyelid: "EYE",
    nose: "NOSE",
    nostrils: "NOSE",
    ear: "EAR",
    earlobe: "EARLOBE",
    cheek: "CHEEK",
    lips: "MOUTH",
    upperlip: "MOUTH",
    lowerlip: "MOUTH",
    tongue: "MOUTH",
    teeth: "MOUTH",
    upperteeth: "MOUTH",
    lowerteeth: "MOUTH",
    chin: "CHIN",
    underchin: "UNDER_CHIN",
}
let locationMapBody = {
    headtop: "HEAD_TOP",
    head: "HEAD", 
    neck: "NECK",
    shoulders: "SHOULDER_LINE",
    shouldertop: "SHOULDER_TOP",
    chest: "CHEST",
    stomach: "STOMACH",
    belowstomach: "BELOW_STOMACH",
}
let locationMap ={};
for( let l in locationMapHead ){ locationMap[l] = locationMapHead[l]; }
for( let l in locationMapBody ){ locationMap[l] = locationMapBody[l]; }

let locationHand_ArmTable = [ "upperarm", "elbow", "elbowinside", "lowerarm" ];
let locationHand_FingerpartTable = [ "tip", "nail", "pad", "midjoint", "base", "side" ];
let locationHand_HandpartTable = [ "wristback", "thumbball", "palm", "handback", "thumbside", "pinkyside" ];

// in JaSigning the location lasts until the end of the sign/gloss or until another instruction overwrites it
function locationBodyArmParser( xml, start, attackPeak, hand, symmetry, signGeneralInfo, currentPosture ){
    let attributes = {};
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }

    let result = { type: "gesture", start: start - 0.00001, attackPeak: attackPeak, hand: hand }; // -0.000001 to avoid locationBodyArm cancelling motions or handconstellations

    // usual body location
    if ( hand == "BOTH" && signGeneralInfo.bothHands ){ result.lrSym = true; }
    else if ( symmetry & 0x01 ){ result.lrSym = true; }  
    if ( symmetry & 0x02 ){ result.udSym = true; }
    if ( symmetry & 0x04 ){ result.oiSym = true; }

    if ( attributes.contact == "armextended" ){ result.distance = 0.5; }
    else if ( attributes.contact == "close" ){ result.distance = 0.3; }
    else { 
        if ( locationMapHead[ attributes.location ] ){ attributes.contact = "touch"; } // need this later for srcContact
        if ( attributes.contact == "touch" ){ result.distance = 0.0; }
        else{ result.distance = 0.4; } 
    } // jasigning has a default unmentioned distance...

    // jasigning might accept some arm locations in the body location instruction. Transform it into a handconstellation
    if ( locationHand_ArmTable.includes( attributes.location ) || locationHand_HandpartTable.includes( attributes.location ) ){
        let r = locationHandInfoExtract( xml, true );
     
        result.handConstellation = true;
        result.dstLocation = r.location;
        result.dstSide = r.side;
        if ( r.child ){
            if ( r.child.finger ){ result.srcFinger = r.child.finger; }
            if ( r.child.location ){ result.srcLocation = r.child.location; }
            if ( r.child.side ){ result.srcSide = r.child.side; }
        }
        return [ result ];
    } // ------

    result.locationBodyArm = locationMap[ attributes.location ];
    let temp = locationMap[ attributes.second_location ];
    if ( temp ){ result.secondLocationBodyArm = temp; }
    switch( attributes.side ){
        case "right_at": result.side = "r"; break;
        case "right_beside": result.side = "rr"; break;
        case "left_at": result.side = "l"; break;
        case "left_beside": result.side = "ll"; break;
        default:   
            if ( hand == "BOTH" && signGeneralInfo.bothHands ){ 
                result.side = signGeneralInfo.domHand[0].toLowerCase();
                result.lrSym = true;
            }
            break;    
    }
    switch( attributes.second_side ){
        case "right_at": result.secondSide = "r"; break;
        case "right_beside": result.secondSide = "rr"; break;
        case "left_at": result.secondSide = "l"; break;
        case "left_beside": result.secondSide = "ll"; break;
        default: 
            if ( hand == "BOTH" && signGeneralInfo.bothHands ){ 
                result.secondSide = signGeneralInfo.domHand[0].toLowerCase();
                result.lrSym = true;
            }
            break;    
    }

    if ( xml.children.length > 0 && xml.children[0].tagName == "location_hand" ){
        let locationHand = locationHandInfoExtract( xml.children[0], false );
        if ( locationHand.location ){ result.srcLocation = locationHand.location; }
        if ( locationHand.side ){ result.srcSide = locationHand.side; }
        if ( locationHand.finger ){ result.srcFinger = locationHand.finger; }
    }else{
        let handshape = currentPosture[ hand == signGeneralInfo.nonDomHand ? signGeneralInfo.nonDomHand : signGeneralInfo.domHand ][3].handshape;

        // when touch or specific hand in face, check if handshape is 
        let shouldBeFingerSelected = ( attributes.contact == "touch" ) || ( hand != "BOTH" && locationMapHead[ attributes.location ] );
        shouldBeFingerSelected = shouldBeFingerSelected &&  ( handshape != "FLAT" && handshape != "FIST" && handshape != "FINGER_2345" );

        if ( shouldBeFingerSelected ){
            // actually should be the selected finger but let's keep it simple for now
            result.srcFinger = "1";
            if ( handshape == "FINGER_2" || handshape == "FINGER_23" || handshape == "FINGER_23_SPREAD" || handshape == "FINGER_2345" ){
                result.srcFinger = "2";
            }
            result.srcLocation = "TIP";
        }else{
            result.srcLocation = "HAND";
            result.srcSide = "PALMAR";
        }
    }

    return [ result ];
}

function locationHandInfoExtract( xml, parseChildren = true ){
    
    // given how handconstellation works, the location_hand inside a location_hand means the srcLocation
    // given how handconstellation works, the location_hand inside a location_bodyArm means the srcLocation

    let attributes = {};
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }

    let result = {};

    // some fingerpart specified
    if ( attributes.digits || locationHand_FingerpartTable.includes( attributes.location ) ){
        // default values tip of index finger
        let digit = parseInt( attributes.digits );
        result.finger = ( isNaN(digit) || digit < 1 || digit > 5 ) ? 2 : digit; 
        result.location = "TIP"; 

        let side = "PALMAR";
        switch( attributes.side ){
            case "right_at": 
            case "right_beside": 
                side = "RIGHT"; 
                break; 
            case "left_at": 
            case "left_beside": 
                side = "LEFT"; 
                break; 
            case "front": side = "PALMAR"; break; 
            case "dorsal": side = "BACK"; break;
            case "palmar":
            case "back":
            case "radial":
            case "ulnar": 
                side = attributes.side.toUpperCase(); 
                break;
            default: break;
        }

        switch( attributes.location ){
            case "nail": 
                result.location = "PAD";
                result.side = side;  
                break;
            case "pad":
                result.location = "PAD";
                result.side = side;
                break;
            case "midjoint": 
                result.location = "MID";
                result.side = side;
                break;
            case "side":
                result.location ="MID";
                result.side = "UNLA";
                break;
            case "base":
                result.location = "BASE";
                result.side = side;
                break;
            case "tip":
                result.location = "TIP";
                result.side = null;
                break;
            default: break;
        }
    }
    else if ( locationHand_HandpartTable.includes( attributes.location ) ){
         // default values tip of index finger
        result.location = "HAND"; 
        result.side = "PALMAR";

        let side = "PALMAR";
        switch( attributes.side ){
            case "right_at": 
            case "right_beside": 
                side = "RIGHT"; // realizer will automatically compute wheter it is the ulna or the radius
                break; 
            case "left_at": 
            case "left_beside": 
                side = "LEFT"; // realizer will automatically compute wheter it is the ulna or the radius
                break;
            case "front": side = "PALMAR"; break; 
            case "dorsal": side = "BACK"; break;
            case "palmar":
            case "back":
            case "radial":
            case "ulnar": 
                side = attributes.side.toUpperCase(); 
                break;
            default: break;
        }

        switch( attributes.location ){
            case "wristback": 
                result.location = "WRIST";
                result.side = side;
                break;
            case "thumbball":
                result.location = "THUMB_BALL";
                result.side = side;
                break;
            case "palm": 
                result.location = "HAND";
                result.side = "PALMAR";
                break;
            case "handback":
                result.location ="HAND";
                result.side = "BACK";
                break;
            case "thumbside":
                result.finger = "2"
                result.location = "BASE";
                result.side = "RADIAL";
                break;
            case "pinkyside":
                result.finger = "5"
                result.location = "BASE";
                result.side = "ULNAR";
                break;    
            default: break;
        }
    }

    else if ( locationHand_ArmTable.includes( attributes.location ) ){
        // default values tip of index finger
        result.location = "HAND"; 
        result.side = "FRONT";

        let side = "FRONT";
        switch( attributes.side ){
            case "dorsal": side = "BACK"; break;
            case "palmar":
            case "front": 
            case "back":
            case "radial":
            case "ulnar": 
                side = attributes.side.toUpperCase(); 
                break;
            default: break;
        }

        switch( attributes.location ){
            case "upperarm": 
                result.location = "UPPER_ARM";
                result.side = side == "PALMAR" ? "FRONT" : side;
                break;
            case "elbow":
                result.location = "ELBOW";
                result.side = side == "PALMAR" ? "FRONT" : side;
                break;
            case "elbowinside": 
                result.location = "ELBOW";
                result.side = "FRONT";
                break;
            case "lowerarm":
                result.location ="FOREARM";
                result.side = side == "FRONT" ? "PALMAR" : side;
                break;
            default: break;
        }
    }


    if ( parseChildren && xml.children.length > 0 && xml.children[0].tagName == "location_hand" ){
        result.child = locationHandInfoExtract( xml.children[0], false );
    }

    result.contact = attributes.contact;


    return result;

    // second_location         %site_hand;
    // second_side             %side;
    // second_digits           CDATA           #IMPLIED
    // approx_second_location  %boolfalse;
}

function locationHandAsHandConstellationParser( xml, start, attackPeak, hand, signGeneralInfo, currentPosture ){
    let locationHand = locationHandInfoExtract( xml, true );
    if ( !locationHand ){ return []; }

    let result = { type: "gesture", start: start, attackPeak: attackPeak, hand: hand, handConstellation: "true" };

    result.hand = hand;
    if ( locationHand.location ){ result.dstLocation = locationHand.location; }
    if ( locationHand.side ){ result.dstSide = locationHand.side; }
    if ( locationHand.finger ){ result.dstFinger = locationHand.finger; }
    if ( locationHand.child ){
        if ( locationHand.child.location ){ result.srcLocation = locationHand.child.location; }
        if ( locationHand.child.side ){ result.srcSide = locationHand.child.side; }
        if ( locationHand.child.finger ){ result.srcFinger = locationHand.child.finger; }
    }else{
        result.srcLocation = "tip";
        result.srcFinger = "1";
    }
    return [ result ];

}

function handConstellationParser( xml, start, attackPeak, hand, signGeneralInfo, currentPosture ){
    let attributes = {};
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }

    let result = { type: "gesture", start: start, attackPeak: attackPeak, hand: hand, handConstellation: "true" };

    if ( attributes.contact == "touch" ){ result.distance = 0.0; }
    else if ( attributes.contact == "close" ){ result.distance = 0.2; }
    else if ( attributes.contact == "armextended" ){ result.distance = 0.5; }
    else { result.distance = 0.0; } 


    let locBodyArm = null; 
    let locationHandCount = 0;
    for ( let i = 0; ( i < xml.children.length ) && ( i < 3 ); ++i ){

        let child = xml.children[i];
        if ( child.tagName == "location_bodyarm" ){
            locBodyArm = locationBodyArmParser( child, start - 0.0000001, attackPeak, "BOTH", 0x00, signGeneralInfo, currentPosture );
            if ( locBodyArm && locBodyArm.length > 0 ){ locBodyArm = locBodyArm[0]; }
            else{ locBodyArm = null; }
            break;
        }else if ( child.tagName == "location_hand" ){
            let locationHand = locationHandInfoExtract( child, false );
            if ( i == 0 ){
                if( locationHand.location ){ result.dstLocation = locationHand.location; }
                if( locationHand.side ){ result.dstSide = locationHand.side; }
                if( locationHand.finger ){ result.dstFinger = locationHand.finger; }
                locationHandCount++;
            }else{
                if( locationHand.location ){ result.srcLocation = locationHand.location; }
                if( locationHand.side ){ result.srcSide = locationHand.side; }
                if( locationHand.finger ){ result.srcFinger = locationHand.finger; }
                locationHandCount++;
            }
            continue;
        }
        else{
            break;
        }
    }

    // if location hands missing and it is singlehanded, get last handconstellation location and change its distance
    if ( hand != "BOTH" && locationHandCount == 0 ){
        if ( currentPosture.handConstellation ){
            let newResult = JSON.parse( JSON.stringify( currentPosture.handConstellation ) );    
            newResult.distance = result.distance;
            newResult.start = result.start;
            newResult.attackPeak = result.attackPeak;
            if ( locBodyArm ){ return [ locBodyArm, newResult ]; }
            return [ newResult ];
        }
        if ( locBodyArm ){ return locBodyArm; }
        locBodyArm = JSON.parse( JSON.stringify( currentPosture[ hand ][0] ) );    
        locBodyArm.distance = result.distance;
        locBodyArm.start = result.start;
        locBodyArm.attackPeak = result.attackPeak;
        return [ locBodyArm ];
    }

    // must reuse old handconstellation src and dst if no location hands are present
    if ( locationHandCount < 1 ){
        if ( currentPosture && currentPosture.handConstellation ){
            if ( currentPosture.handConstellation.dstLocation ){ result.dstLocation = currentPosture.handConstellation.dstLocation; }
            if ( currentPosture.handConstellation.dstSide ){ result.dstSide = currentPosture.handConstellation.dstSide; }
            if ( currentPosture.handConstellation.dstFinger ){ result.dstFinger = currentPosture.handConstellation.dstFinger; }
        }else{
            // "wachten" sign needs these
            result.dstLocation = "TIP"; 
            result.dstFinger = "1";
        }
    }
    if ( locationHandCount < 2 ){
        if( currentPosture && currentPosture.handConstellation ){
            if ( currentPosture.handConstellation.srcLocation ){ result.srcLocation = currentPosture.handConstellation.srcLocation; }
            if ( currentPosture.handConstellation.srcSide ){ result.srcSide = currentPosture.handConstellation.srcSide; }
            if ( currentPosture.handConstellation.srcFinger ){ result.srcFinger = currentPosture.handConstellation.srcFinger; }
        }else{
            // "wachten" sign needs these
            result.srcLocation = "TIP";
            result.srcFinger = "1";
        }
    }

    if ( locBodyArm ){ return [ locBodyArm, result ]; }
    return [ result ];

}

// function motionParser( xml, start, bothHands, domHand, symmetry, currentPosture, signSpeed ){
function motionParser( xml, start, hand, symmetry, signSpeed, signGeneralInfo, currentPosture ){ // bothHands attribute because a split 
    let result = [];
    let time = start;
    let tagName = xml.tagName;

    // TODO HALT: should change interpolation method
    let attributes = {};
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }
    if ( attributes.fast == "true" ){ signSpeed *= 1.5; }
    if ( attributes.slow == "true" ){ signSpeed *= 0.5; }
    if ( attributes.tense == "true" ){ signSpeed *= 0.5; }
    

    if ( simpleMotionAvailable.includes( tagName ) ){
        let r = simpleMotionParser( xml, time, hand, symmetry, signSpeed, signGeneralInfo );
        result = result.concat( r.data );
        time = r.end;
    }
    else if ( tagName == "split_motion" ){ // split instruction removes any symmetry. Both_hands flag does not matter
        //<!ELEMENT split_motion ( ( %motion; ), ( %motion; ) ) >

        let maxEnd = time;
        // JaSigning breaks if one motion is missing, but not supporting it now.
        if ( xml.children.length > 0 && motionsAvailable.includes( xml.children[0].tagName ) ){
            let r = motionParser( xml.children[0], time, signGeneralInfo.domHand, 0x00, signSpeed, signGeneralInfo, currentPosture );
            result = result.concat( r.data );
            if( maxEnd < r.end ){ maxEnd = r.end; }
        }
        if ( xml.children.length > 1 && motionsAvailable.includes( xml.children[1].tagName ) ){
            let r = motionParser( xml.children[1], time, signGeneralInfo.nonDomHand, 0x00, signSpeed, signGeneralInfo, currentPosture );
            result = result.concat( r.data );
            if( maxEnd < r.end ){ maxEnd = r.end; }
        }
        time = maxEnd;
    }
    else if ( tagName == "seq_motion" ){
        // <!ELEMENT seq_motion ( ( %motion; ), ( %motion; )+ ) >

        for( let i = 0; i < xml.children.length; ++i ){
            if ( motionsAvailable.includes( xml.children[i].tagName ) ){
                if ( xml.children[i].tagName == "rpt_motion" || xml.children[i].tagName == "tgt_motion" ){
                    currentPosture = currentPostureUpdate( currentPosture, result );    
                }
                let r = motionParser( xml.children[i], time, hand, symmetry, signSpeed, signGeneralInfo, currentPosture );
                result = result.concat( r.data );
                time = r.end;
            }
        }
    }
    else if ( tagName == "par_motion" ){
        // <!ELEMENT par_motion ( ( %motion; ), ( %motion; )+ ) >

        let maxEnd = time;
        let blockResult = []; // block == motion with children 
        for ( let i = 0; i < xml.children.length; ++i ){
            if ( motionsAvailable.includes( xml.children[i].tagName ) ){
                let r = motionParser( xml.children[i], time, hand, symmetry, signSpeed, signGeneralInfo, currentPosture );
                blockResult.push( r );
                if ( maxEnd < r.end ){ maxEnd = r.end; }
            }
        }

        // remap bml instructions to the slowest block (motion might have nesting)
        for ( let i = 0; i < blockResult.length; ++i ){
            let block = blockResult[i];
            remapBlockTiming( time, block.end, time, maxEnd, block.data );
            result = result.concat( block.data );
        }
        time = maxEnd;
    }
    else if ( tagName == "tgt_motion" ){
        // <!ELEMENT tgt_motion ( ( %motion; ), ( %posture; ) ) >

        let motionBlock = null;
        let postureBlocks = [];
        let maxEnd = time;
        let locationOrHandconstellation= false;
        for ( let i = 0; i < xml.children.length; ++i ){
            if ( motionsAvailable.includes( xml.children[i].tagName ) ){
                if ( motionBlock || postureBlocks.length ) { break; } // if a second motion is present, all subsequent postures are ignored
                else {
                    motionBlock = motionParser( xml.children[i], time, hand, symmetry, signSpeed, signGeneralInfo, currentPosture );
                    if ( maxEnd < motionBlock.end ){ maxEnd = motionBlock.end; } 
                } 
            }
            else if ( posturesAvailable.includes( xml.children[i].tagName ) ){
                let r = postureParser( xml.children[i], time, hand, symmetry, signSpeed, signGeneralInfo, currentPosture );
                postureBlocks.push( r );
                currentPosture = currentPostureUpdate( currentPosture, r.data ); // needed for location_hand in locatoin_bodyarm...
                for ( let l = 0; l < r.data.length; ++l ){
                    if ( r.data[l].locationBodyArm || r.data[l].handConstellation ){ locationOrHandconstellation = true; }
                }
                if ( maxEnd < r.end ){ maxEnd = r.end; } 
            }
        }

        // remap bml instructions to the slowest block (motion might have nesting)
        let motionInstructions = [];
        if ( motionBlock ){
            remapBlockTiming( time, motionBlock.end, time, maxEnd, motionBlock.data );
            motionInstructions = motionBlock.data;
        }
        
        let postureInstructions = [];        
        for ( let i = 0; i < postureBlocks.length; ++i ){
            let block = postureBlocks[i];
            remapBlockTiming( time, block.end, time, maxEnd, block.data );
            postureInstructions = postureInstructions.concat( block.data );
        }

        // TODO: this is not quite correct. All last par directed should be deleted. Also timings might be messed up
        if ( locationOrHandconstellation ){
            let lastDirectedMotionIdx = -1;
            let lastDirectedMotionStart = -1;
            for ( let l = 0; l < motionInstructions.length; ++l ){
                if ( motionInstructions[l].motion == "directed" && lastDirectedMotionStart < motionInstructions[l].start ){ 
                    lastDirectedMotionStart = motionInstructions[l].start; 
                    lastDirectedMotionIdx = l;
                }
            }            
            if ( lastDirectedMotionIdx > -1 ){ motionInstructions[lastDirectedMotionIdx].distance = 0; } // do not remove as curve and zigzag still work..
        }
        result = result.concat( motionInstructions );
        result = result.concat( postureInstructions );
        time = maxEnd;

    }
    else if ( tagName == "rpt_motion" ){ // TO DO
        // <!ELEMENT rpt_motion ( %motion; ) >

        if ( xml.children.length > 0 && motionsAvailable.includes( xml.children[0].tagName ) ){
            let r = motionParser( xml.children[0], time, hand, symmetry, signSpeed, signGeneralInfo, currentPosture );
            let blockDuration = r.end - time;
            let isBackwardNecessary = false;
            for ( let i = 0; i < r.data.length; ++i ){
                if ( r.data[i].handConstellation || r.data[i].locationBodyArm || r.data[i].handshape || r.data[i].extfidir || r.data[i].palmor || r.data[i].motion == "directed" ){
                    isBackwardNecessary = true; 
                    break;
                }
            }
            
            switch ( attributes.repetition ){
                case "fromstart":  /* forward. Then go directly to the original pose. Forward. Repeat completed */ 
                case "fromstart_several":
                case "manyrandom": /* forward. Then go directly to the original pose. Forward. Repeat completed*/
                    let amountLoops = ( attributes.repetition == "fromstart" ) ? 1 : 2;
                    let loopDuration = blockDuration + isBackwardNecessary * TIMESLOT.POSTURE / signSpeed;
                    for( let loop = 0; loop < amountLoops; ++loop ){
                        
                        // forward
                        let forward = JSON.parse( JSON.stringify( r.data ) ); 
                        for( let i = 0; i < forward.length; ++i ){
                            if( typeof( forward[i].start ) == "number" ){ forward[i].start += loop * loopDuration; } 
                            if( typeof( forward[i].attackPeak ) == "number" ){ forward[i].attackPeak += loop * loopDuration; } 
                            if( typeof( forward[i].ready ) == "number" ){ forward[i].ready += loop * loopDuration; } 


                            if ( r.data[i].locationBodyArm || r.data[i].handshape || r.data[i].extfidir || r.data[i].palmor ){
                                continue;
                            }
                            
                            // start relax-end at the end of the block until loop duration
                            if( typeof( forward[i].relax ) == "number" ){ forward[i].relax += loop * loopDuration; } 
                            else{ forward[i].relax = forward[i].start + blockDuration; }
                            if( typeof( forward[i].end ) == "number" ){ forward[i].end += loop * loopDuration; }
                            else{ forward[i].end = forward[i].start + blockDuration + TIMESLOT.POSTURE / signSpeed; } 
                        }
                        result = result.concat( forward );

                        time += blockDuration; // add forward time


                        // backward
                        if ( isBackwardNecessary ){
                            let backward = [];
                            let backwardAddConstellation = false;
                            // check which actions are performend in rpt and select their backward position
                            for( let i = 0; i < r.data.length; ++i ){
                                let type = -1;
                                let d = r.data[i];
                                if ( d.locationBodyArm ){ type = 0; }
                                else if ( d.extfidir ){ type = 1; }
                                else if ( d.palmor ){ type = 2; }
                                else if ( d.handshape ){ type = 3; }
                                else if ( d.handConstellation ){ type = 4; }

                                if ( type == 4 ){ backwardAddConstellation = !!currentPosture.handConstellation; } // flag as true only if there was a previous handconstellation
                                else if ( type > -1 ){
                                    if ( d.hand == "RIGHT" || d.hand == "BOTH" ){ backward.push( JSON.parse( JSON.stringify( currentPosture["RIGHT"][ type ] ) ) ); }
                                    if ( d.hand == "LEFT" || d.hand == "BOTH" ){ backward.push( JSON.parse( JSON.stringify( currentPosture["LEFT"][ type ] ) ) ); }

                                    // there was a handconstellation before rpt_motion
                                    if ( d.locationBodyArm && currentPosture.handConstellation ){ backwardAddConstellation |= currentPosture.handConstellation.hand == "BOTH" || d.locationBodyArm.hand == currentPosture.handConstellation.hand; }
                                }                            
                            }
                            // fix timings of backward instructions
                            for ( let i = 0; i < backward.length; ++i ){
                                backward[i].start = time - 0.00001;
                                backward[i].attackPeak = time + TIMESLOT.POSTURE / signSpeed;            
                            }
                            result = result.concat( backward );
                            if ( backwardAddConstellation ){
                                backward = JSON.parse( JSON.stringify( currentPosture.handConstellation ) )
                                backward.start = time; 
                                backward.attackpeak = time + TIMESLOT.POSTURE / signSpeed;
                                result.push( backward );
                            }
                            time += TIMESLOT.POSTURE / signSpeed; // add backward time
                        }
                    }

                    // final forward
                    let finalForward = r.data;
                    let offset = amountLoops * loopDuration;
                    for( let i = 0; i < finalForward.length; ++i ){
                        if( !isNaN( finalForward[i].start ) ){ finalForward[i].start += offset; } 
                        if( !isNaN( finalForward[i].attackPeak ) ){ finalForward[i].attackPeak += offset; } 
                        if( !isNaN( finalForward[i].ready ) ){ finalForward[i].ready += offset; } 
                        if( !isNaN( finalForward[i].relax ) ){ finalForward[i].relax += offset; } 
                        if( !isNaN( finalForward[i].end ) ){ finalForward[i].end += offset; } 
                    }
                    result = result.concat( finalForward );
                    
                    time += blockDuration; // add forward time

                    break;
                case "tofroto": /* forward. inverse of everything. forward again */ 
                    // timings during reverse are inverted

                    // circular:  swap endAngle and startAngle
                    // directed:  use  with all symmetry set to the direction (curve should not be necessary)
                    // wrist and fingerplay: nothing special

                    // posture: be careful with start and attackpeak timings
                break;
                case "reverse": /* tofroto without last forward. So only forward, backward */ break;
                case "continue": /* forward. keeps directed. After each repetition, quickly go to original posture. Forward. */ 
                case "continue_several":
                    // same as fromstart but keeps directedmotion offset. Remember we remove directed and circular after each location_bodyarm on our realizer
                break;
                case "swap": /* no repetition, may be deprecated. Use default */
                default:
                    result = result.concat( r.data );
                    time += blockDuration; // add forward time
                    break;
            }

        }
    }

    if ( attributes.rest == "true" ){ time += TIMESLOT.REST / signSpeed; }

    return{ data: result, end: time }
}

// necessary for nesting such in tgt and par
function remapBlockTiming ( srcStart, srcEnd, dstStart, dstEnd, bmlArray ){
    let timings = [ "start", "attackPeak", "relax", "end", "ready" ];
    
    for( let i = 0; i < bmlArray.length; ++i ){
        let bml = bmlArray[i];

        for( let j = 0; j < timings.length; ++j ){
            if ( typeof( bml[ timings[j] ] ) == "number" ){
                let f = ( bml[ timings[j] ] - srcStart ) / ( srcEnd - srcStart ); 
                bml[ timings[j] ] = dstStart * ( 1.0 - f ) + dstEnd * f ;        
            }
        }    
    }
}

function simpleMotionParser( xml, start, hand, symmetry, signSpeed, signGeneralInfo ){
    let resultArray = [];
    let duration = 0;
    let attributes = {}
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        attributes[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }

    if ( xml.tagName == "directedmotion" ){
        let result = {};
        result.motion = "directed";

        result.direction = attributes.direction;
        if ( attributes.size == "big" ){ result.distance = 0.2; }
        else if( attributes.size == "small" ){ result.distance = 0.06; }
        else{ result.distance = 0.12; }

        if ( attributes.second_direction ){
            result.seconDirection = attributes.second_direction;
            if ( attributes.second_size == "big" ){ result.distance = 0.5 * result.distance + 0.5 * 0.15; }
            else if ( attributes.second_size == "small" ){  result.distance = 0.5 * result.distance + 0.5 * 0.06; }
        }
    
        if ( attributes.curve ){
            result.curve = attributes.curve;
            if ( attributes.curve_size == "big" ){ result.curveSize = 0.5; }
            else if ( attributes.curve_size == "small" ){ result.curveSize = 0.05; }
            else { result.curveSize = 0.15; }
        }

        if ( attributes.zigzag_style == "wavy" || attributes.zigzag_style == "zigzag" ){ 
            result.zigzag = "l"; result.zigzagSpeed = 5; 
            if ( attributes.zigzag_size == "big" ){ result.zigzagSize = 0.3; } // "small" == default value
            else { result.zigzagSize = 0.1; } // "small" == default value
        }
        
        duration = TIMESLOT.MOTIONDIR / signSpeed;
        result.attackPeak = start + duration;
        resultArray.push( result );
    }
    else if ( xml.tagName == "circularmotion" ){
        let result = {};
        result.motion = "circular";
        
        result.direction = attributes.axis;
        if ( attributes.size == "big" ){ result.distance = 0.1; }
        else if ( attributes.size == "small" ){ result.distance = 0.02; }
        else { result.distance = 0.05; }
        
        if ( attributes.second_axis ){
            result.seconDirection = attributes.second_axis;
        }

        let anglesTable = { "l":0, "ul":45, "u":90, "ur":135, "r":180, "dr":225, "d":270, "dl":315  } 
        result.startAngle = anglesTable[ attributes.start ]; 
        if ( isNaN( result.startAngle ) ) { result.startAngle = 0; }
        if ( isNaN( result.endAngle ) ) { result.endAngle = result.startAngle + 360; }
        if ( attributes.clockplus || attributes.second_clockplus ){ result.endAngle = result.startAngle + 2 * ( result.endAngle - result.startAngle );} 
        if ( typeof( result.direction ) == "string" && result.direction.includes( "i" ) ){
                result.endAngle = (result.endAngle - result.startAngle) + ( result.startAngle * (-1) ); // new_start + old_deltaAngle
                result.startAngle *= -1; // new_start
        }

        if ( attributes.zigzag_style == "wavy" || attributes.zigzag_style == "zigzag" ){ 
            result.zigzag = "o"; 
            if ( attributes.zigzag_size == "big" ){ result.zigzagSize = 0.3; }
            else { result.zigzagSize = 0.1; }
        }

        switch( attributes.ellipse_direction ){
            case "h": result.ellipseAxisDirection = "l"; result.ellipseAxisRatio = 0.5; break;
            case "ur": result.ellipseAxisDirection = "ur"; result.ellipseAxisRatio = 0.5; break;
            case "v": result.ellipseAxisDirection = "u"; result.ellipseAxisRatio = 0.5; break;
            case "ul": result.ellipseAxisDirection = "ul"; result.ellipseAxisRatio = 0.5; break;
            default: break; // defaults to ellipseAxisRatio = 0.5
        }

        duration = TIMESLOT.MOTIONCIRC / signSpeed;
        result.start = start;
        result.attackPeak = start + duration;
        resultArray.push( result );

        // wait for a 180º of phase between hands (even if angles are shorter than 180)
        if ( hand == "BOTH" && signGeneralInfo.outofphase ){ 
            let resultOutOfPhase = JSON.parse( JSON.stringify( result ) );
            let timeTo180 = 90 * duration / Math.abs( result.endAngle - result.startAngle ); // how much timet would need to move 180º
            resultOutOfPhase.start += timeTo180;
            resultOutOfPhase.attackPeak += timeTo180;
            resultOutOfPhase.hand = signGeneralInfo.nonDomHand;
            resultArray.push( resultOutOfPhase );
            result.hand = signGeneralInfo.domHand;
            duration += timeTo180;
        }
    }
    else if ( xml.tagName == "wristmotion" ){
        let result = {};
        result.motion = "wrist";
        if ( attributes.size == "big" ){ result.intensity = 0.3; } 
        else { result.intensity = 0.1; }
        result.mode = attributes.motion.toUpperCase().replace("STIR", "STIR_");
        result.speed = 4;

        duration = TIMESLOT.MOTION / signSpeed;
        result.end = start + duration;
        resultArray.push( result );
    }
    else if ( xml.tagName == "fingerplay" ){
        let result = {};
        result.motion = "fingerplay";
        result.intensity = 0.5;
        if ( attributes.digits ){ result.fingers; }

        duration = TIMESLOT.MOTION / signSpeed;
        result.end = start + duration;
        resultArray.push( result );
    } 

    for( let i = 0; i < resultArray.length; ++i ){
        let o = resultArray[i];
        o.type = "gesture";
        if ( !o.start ) { o.start = start; }
        if ( !o.hand ) { o.hand = hand; } 

        if ( symmetry & 0x01 ){ o.lrSym = true; }
        // o.udSym = 0x00; // symmetry & 0x02; Jasiggning: does not work 
        if ( symmetry & 0x04 ){ o.oiSym = true; }
    }

    return { data: resultArray, end: start + duration };

}



// ###############################################
// #              Non Manual Parser              #
// ###############################################

function signNonManual( xml, start, signSpeed ){
    // [ is tier done, par tag, available tags ]
    let tiersAvailable = { // only one instance of each is allowed in jasigning
        shoulder_tier:   [ false, "shoulder_par",   [ "shoulder_movement" ] ],
        body_tier:       [ false, "body_par",       [ "body_movement" ] ],
        head_tier:       [ false, "head_par",       [ "head_movement" ] ],
        eyegaze_tier:    [ false, "eye_par",        [ "eye_gaze" ] ],
        facialexpr_tier: [ false, "facial_expr_par",[ "eye_gaze", "eye_brows", "eye_lids", "nose" ] ], //for some reason eye_gaze works also
        mouthing_tier:   [ false, "mouthing_par",   [ "mouth_gesture", "mouth_picture", "mouth_meta" ] ],
        extra_tier:      [ false, "extra_par",      [ "extra_movement" ] ],
    };
    // todo: "neutral" is an available tag, but not used in our database

    let result = [];
    let end = start;
    start += TIMESLOT.HAND / signSpeed; // start after basic hand-arm positioning

    /**
     * Result = [ whatever tier, whatever tier, ... ]
     * Whatever tier = [ instructions, instructions, ... ]
     * Instructions = [ single bml, single bml ]
     * 
     * Different tiers do NOT get into each other with timings. Each reproduces their "instructions" sequentally. 
     * While an "instructions" reaches peak, the previous reaches end. Except the last "instructions", which will be kept at peak until MFs finish.
     * Some "instructions" are composed of several mini bmls, that is reason for it being an array
     * All timing 
    */
    
    for ( let i = 0; i < xml.children.length; ++i ){ // check all present tiers
        let tier = tiersAvailable[ xml.children[i].tagName ];
        if ( tier && !tier[0] ){ // if tier is not already done
            tier[0] = true; // flag tier as done
            let actions = xml.children[i].children;
            let time = start; // start after basic hand-arm positioning
            let tierLasActions = [-1,-1];
            for( let a = 0; a < actions.length; ++a ){ // check all actions inside this tier
                if ( tier[2].includes( actions[a].tagName ) ){ // simple sequential action ( jasigning )
                    let r = baseNMFActionToJSON( actions[a], time, signSpeed );
                    if ( !r || r.length < 1 ){ continue; }
                    tierLasActions[0] = result.length;
                    tierLasActions[1] = r.data.length;
                    result = result.concat( r.data );
                    time = r.end;
                }
                else if ( tier[1] == actions[a].tagName ){ // set of parallel actions
                    // all actions inside par tag start and end at the same time, regardless of action type
                    let subActions = actions[a].children;
                    let subMaxEnd = time;
                    for ( let sa = 0; sa < subActions.length; ++sa ){ // check all actions inside parallel tag
                        if ( tier[2].includes( subActions[sa].tagName ) ){
                            // sequential actions ( jasigning )
                            let r = baseNMFActionToJSON( subActions[sa], time, signSpeed );
                            if ( !r || r.length < 1 ){ continue; }
                            result = result.concat( r.data );
                            if ( r.end > subMaxEnd ){ subMaxEnd = r.end; }
                        }
                    }
                    time = subMaxEnd;
                }
            } // end of for actions in tier
            if ( end < time ){ end = time; }
        }        
    } // end of of for tier

    return { data: result, end: end };
}

function baseNMFActionToJSON( xml, startTime, signSpeed ){
    // parse attributes from array of xml objects into an object where key=tagName, value=xml.value
    let obj = {}
    for( let attr = 0; attr < xml.attributes.length; ++attr ){
        obj[ xml.attributes[attr].name ] = xml.attributes[attr].value;
    }

    // Incoming signSpeed is ignored. Only speeds inside the basic instruction are taken into account. 
    signSpeed = parseFloat( obj.speed );
    signSpeed = isNaN( signSpeed ) ? 1 : signSpeed;
    let signAmount = parseFloat( obj.amount );
    signAmount = isNaN( signAmount ) ? 1 : signAmount; 

    let result = null;
    switch( xml.tagName ){
        case "shoulder_movement": result = shoulderMovementTable[ obj.movement ]; break;  // - movement   
        case "body_movement": result = bodyMovementTable[ obj.movement ]; break; // - movement
        case "head_movement": result = headMovementTable[ obj.movement ]; break; // - movement
        case "eye_gaze": result = eyeGazeTable[ obj.movement || obj.direction ]; break;  // direction or movement. movement has priority even if wrong
        case "eye_brows": result = eyebrowsTable[ obj.movement ]; break;
        case "eye_lids": result = eyelidsTable[ obj.movement ]; break;
        case "nose": result = noseTable[ obj.movement ]; break;
        case "mouth_gesture": result = mouthGestureTable[ obj.movement ]; break; // - movement
        case "mouth_picture": 
            let text = obj.picture;
            // transform text from SIL encoding to ARPABET encoding
            result = { type:"speech", text:text+".", sentInt: 0.5 };
            break; // - picture
        case "mouth_meta": break; // - mouthmetatype    --- ?????
        case "extra_movement": break; // - movement     --- ?????
        case "neutral": break; // - -
        default:
            return null;
    }

    if ( !result ){ return null; }
    result = JSON.parse( JSON.stringify( result ) );

    // post process
    if ( !Array.isArray( result ) ){
        result = [ result ];
    }
    let maxEnd = startTime;
    for( let i = 0; i < result.length; ++i ){
        let o = result[i];

        // modify amount/intensity depending of sign's amount
        if ( o.hasOwnProperty( "amount" ) ){ o.amount *= signAmount; }
        else if ( o.hasOwnProperty( "shoulderRaise" ) ){ o.shoulderRaise *= signAmount; }
        else if ( o.hasOwnProperty( "shoulderHunch" ) ){ o.shoulderHunch *= signAmount; }

        // adust timing
        o.start = o.start ? ( startTime + o.start / signSpeed ) : startTime;
        if ( o.type == "speech" ) { 
            if( o.speed ) { o.sentT = o.text.length * o.speed; }
            o.sentT = ( o.sentT / signSpeed ) || ( o.text.length / ( 6.66 * signSpeed ) ); // default to 6.66 phonemes per second
            if ( o.start + o.sentT > maxEnd ){ maxEnd = o.start + o.sentT; }
        } 
        else {

            if ( o.duration || o.end ){
                // realizer will infer peak and relax from start and end
                let duration = o.end ? ( (startTime + o.end) - o.start) : o.duration;
                o.end = o.start + duration / signSpeed; 
                if ( o.end > maxEnd ){ maxEnd = o.end; } 
            }else{  
                let repetition = o.repetition ? o.repetition : 0;
                o.attackPeak = o.start + TIMESLOT.NMFSTARTPEAK / signSpeed  ;
                o.relax = o.attackPeak + ( ( 1 + repetition ) * TIMESLOT.NMFWAIT ) / signSpeed;
                o.end = o.relax + ( TIMESLOT.NMFRELAXEND ) / signSpeed;
                
                // set duration of the sign. Default relax
                let timeToTest = o.relax;
                if ( o._durationUntilEnd ){ timeToTest = o.end; delete o._durationUntilEnd; }
                // else if ( o._durationUntilPeak ){ timeToTest = o.attackPeak; delete o._durationUntilPeak; }
                
                if ( timeToTest > maxEnd ){
                    maxEnd = timeToTest;
                }
            }
        }
    }
    return { data: result, end: maxEnd };
}

let shoulderMovementTable = {
    // keeps that position until it changes or the sign ends
    UL: { type: "gesture", shoulderRaise: 0.8, hand: "LEFT"  }, //_left_shoulder_raised                
    UR: { type: "gesture", shoulderRaise: 0.8, hand: "RIGHT" }, //_right_shoulder_raised               
    UB: { type: "gesture", shoulderRaise: 0.8, hand: "BOTH"  }, //_both_shoulders_raised               
    HL: { type: "gesture", shoulderHunch: 0.8, hand: "LEFT"  }, //_left_shoulder_hunched_forward       
    HR: { type: "gesture", shoulderHunch: 0.8, hand: "RIGHT" }, //_right_shoulder_hunched_forward      
    HB: { type: "gesture", shoulderHunch: 0.8, hand: "BOTH"  }, //_both_shoulders_hunched_forward     
    
    // up and down once
    SL: { type: "gesture", shoulderRaise: 0.8, hand: "LEFT", _durationUntilEnd: true }, //_left_shoulder_shrugging_up_and_down 
    SR: { type: "gesture", shoulderRaise: 0.8, hand: "RIGHT", _durationUntilEnd: true }, //_right_shoulder_shrugging_up_and_down
    SB: { type: "gesture", shoulderRaise: 0.8, hand: "BOTH", _durationUntilEnd: true }, //_both_shoulders_shrugging_up_and_down
};

let bodyMovementTable = {
    RL: { type: "gesture", bodyMovement: "ROTATE_LEFT", amount: 0.7 }, // _rotated_left
    RR: { type: "gesture", bodyMovement: "ROTATE_RIGHT", amount: 0.7 }, // _rotated_right
    TL: { type: "gesture", bodyMovement: "TILT_LEFT", amount: 0.5 }, // _tilted_left
    TR: { type: "gesture", bodyMovement: "TILT_RIGHT", amount: 0.5 }, // _tilted_right
    TF: { type: "gesture", bodyMovement: "TILT_FORWARD", amount: 0.5 }, // _tilted_forwards
    TB: { type: "gesture", bodyMovement: "TILT_BACKWARD", amount: 0.5 }, // _tilted_backwards
    RD: { type: "gesture", bodyMovement: "TILT_FORWARD", amount: 0.4 }, // _round  sligthly tilted forwards
    SI: { type: "gesture", bodyMovement: "TILT_BACKWARD", amount: 0.3 }, // _sigh  slightly tilted backwards
    // HE: { type: "gesture", bodyMovement: "HE", amount: 1 }, // _heave   does not work
    // ST: { type: "gesture", bodyMovement: "ST", amount: 1 }, // _straight 
}

let headMovementTable = {
    NO: { type: "head", lexeme: "NOD", repetition: 1 }, //_nodding_up_and_down     
    SH: { type: "head", lexeme: "SHAKE", repetition: 3 }, //_shaking_left_and_right  
    SR: { type: "gaze", influence: "HEAD", target: "RIGHT", headOnly: true }, //_turned_right            
    SL: { type: "gaze", influence: "HEAD", target: "LEFT", headOnly: true }, //_turned_left             
    TR: { type: "head", lexeme: "TILT_RIGHT", repetition: 0 }, //_tilted_right            
    TL: { type: "head", lexeme: "TILT_LEFT", repetition: 0 }, //_tilted_left             
    NF: { type: "head", lexeme: "TILT_FORWARD", repetition: 0 }, //_tilted_forward          
    NB: { type: "head", lexeme: "TILT_BACKWARD", repetition: 0 }, //_tilted_back             
    PF: { type: "head", lexeme: "FORWARD", repetition: 0 }, //_pushed_forward          
    PB: { type: "head", lexeme: "BACKWARD", repetition: 0 }, //_pushed_backward         
    //LI: , //_head_movement_linked_to_eye_gaze
};
let eyeGazeTable = {
    AD:{ type: "gaze", influence: "EYES", target: "CAMERA" },   // _towards_addressee                           
    FR:{ type: "gaze", influence: "EYES", target: "FRONT" },    // _far                                         
    // HD:{ type: "gaze", influence: "EYES", target: "FRONT" }, // _towards_the_signer_s_own_hands              
    // HI:{ type: "gaze", influence: "EYES", target: "FRONT" }, // _towards_the_signer_s_own_dominant_hand      
    // HC:{ type: "gaze", influence: "EYES", target: "FRONT" }, // _towards_the_signer_s_own_non_dominant_hand  
    // RO:{ type: "gaze", influence: "EYES", target: "FRONT" }, // _rolling_eyes                                
    NO:{ type: "gaze", influence: "EYES", target: "FRONT" },    // _no_target_unfocussed                        
    UP:{ type: "gaze", influence: "EYES", target: "UP" },       // _up                                          
    DN:{ type: "gaze", influence: "EYES", target: "DOWN" },     // _down                                        
    LE:{ type: "gaze", influence: "EYES", target: "LEFT" },     // _left                                        
    RI:{ type: "gaze", influence: "EYES", target: "RIGHT" },    // _right                                       
    LU:{ type: "gaze", influence: "EYES", target: "UP_LEFT" },   // _left_up                                     
    LD:{ type: "gaze", influence: "EYES", target: "DOWN_LEFT" }, // _left_down                                   
    RU:{ type: "gaze", influence: "EYES", target: "UP_RIGHT" },  // _right_up                                    
    RD:{ type: "gaze", influence: "EYES", target: "DOWN_RIGHT" },// _right_down
};
let eyebrowsTable = {
    RB: { type: "faceLexeme", lexeme: "BROW_RAISER", amount: 1 }, 
    RR: { type: "faceLexeme", lexeme: "BROW_RAISER_RIGHT", amount: 1 },
    RL: { type: "faceLexeme", lexeme: "BROW_RAISER_LEFT", amount: 1 },
    FU: { type: "faceLexeme", lexeme: "BROW_LOWERER", amount: 1 },
};
let eyelidsTable = {
    WB: { type: "faceLexeme", lexeme: "UPPER_LID_RAISER", amount: 1 },      // wide open
    WR: { type: "faceLexeme", lexeme: "UPPER_LID_RAISER_RIGHT", amount: 1 },// wide open
    WL: { type: "faceLexeme", lexeme: "UPPER_LID_RAISER_LEFT", amount: 1 }, // wide open
    SB: { type: "faceLexeme", lexeme: "EYES_CLOSED", amount: 0.4 },         // slightly closed
    SR: { type: "faceLexeme", lexeme: "WINK_RIGHT", amount: 0.4 },          // slightly closed
    SL: { type: "faceLexeme", lexeme: "WINK_LEFT", amount: 0.4 },           // slightly closed
    CB: { type: "faceLexeme", lexeme: "EYES_CLOSED", amount: 1 },           // closed
    CR: { type: "faceLexeme", lexeme: "WINK_RIGHT", amount: 1 },            // closed
    CL: { type: "faceLexeme", lexeme: "WINK_LEFT", amount: 1 },             // closed
    TB: { type: "faceLexeme", lexeme: "EYES_CLOSED", amount: 1 },           // closed
    TR: { type: "faceLexeme", lexeme: "WINK_RIGHT", amount: 1 },            // closed
    TL: { type: "faceLexeme", lexeme: "WINK_LEFT", amount: 1 },             // closed
    // BB: blink at the end of the sign 
};
let noseTable = {
    WB: { type: "faceLexeme", lexeme: "NOSE_WRINKLER", amount: 1 }, // wrinkle
//     TW: twitch
//     WI: widening nostrils
};
let mouthGestureTable = {
    D01:    { type: "speech",     text: "IIIIs ",                  sentInt: 0.4, sentT: 0.8 }, //_eee_sss                                                     
    D02:    { type: "speech",     text: "ffff ",                   sentInt: 0.4, sentT: 0.6 }, //_f         // in jasiging D02 and D03 are mixed                                                 
    D03:    { type: "speech",     text: "Efff ",                   sentInt: 0.4, sentT: 0.6 }, //_ef                                                         
    D04:    { type: "speech",     text: "afff ",                   sentInt: 0.4, sentT: 0.6 }, //_af                                                         
    D05: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0,   duration: 0.15 },                                            
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.15,duration: 0.15 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.3, duration: 0.15 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.45,duration: 0.15 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.6, duration: 0.15 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.75,duration: 0.15 },
         ], //_clattering_teeth
    D06: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.02, start: 0,   duration: 0.3 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount:  0.4, start: 0,   duration: 0.3 },                                            
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.1, start: 0,   duration: 0.3 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0,   duration: 0.3 },                    
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.02, start: 0.2, duration: 0.2 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount:  0.4, start: 0.2, duration: 0.2 },                                            
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.1, start: 0.2, duration: 0.2 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.2, duration: 0.2 },                    
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.02, start: 0.3, duration: 0.2 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount:  0.4, start: 0.3, duration: 0.2 },                                            
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.1, start: 0.3, duration: 0.2 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.3, duration: 0.2 },                    
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.02, start: 0.45,duration: 0.2 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount:  0.4, start: 0.45,duration: 0.2 },                                            
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.1, start: 0.45,duration: 0.2 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.45,duration: 0.2 },                    
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.02, start: 0.6, duration: 0.2 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount:  0.4, start: 0.6, duration: 0.2 },                                            
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.1, start: 0.6, duration: 0.2 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.6, duration: 0.2 },                    
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.02, start: 0.75,duration: 0.2 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount:  0.4, start: 0.75,duration: 0.2 },                                            
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.1, start: 0.75,duration: 0.2 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.75,duration: 0.2 },                    
        ],  //_clattering_teeth_with_raised_upper_lip 
    D07: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.4, start: 0,    duration: 0.3 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount: 0.2, start: 0,    duration: 0.3 },
            { type: "faceLexeme", lexeme: "LOWER_LIP_DEPRESSOR",   amount: 0.4, start: 0,    duration: 0.3 },
            { type: "speech",     text: "mm ",                     start: 0.25, sentInt: 0.5,sentT: 0.5 }
         ], //_one_bite_resulting_in_closed_teeth                         
    D08: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.4, start: 0,    duration: 0.3 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount: 0.6, start: 0.1,  duration: 0.8 },
            { type: "faceLexeme", lexeme: "LOWER_LIP_DEPRESSOR",   amount: 0.8, start: 0,    duration: 0.8 },
            { type: "faceLexeme", lexeme: "JAW_DROP",              amount: -0.3, start: 0.25,duration: 0.5 },
         ], //_one_bite_lips_stretched_teeth_visible                      
    D09: [  { type: "speech",     text: "tAiii ",                    sentInt: 0.8, sentT: 0.5 }, 
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",            amount: 1, start: 0.3,    duration: 0.5 }
         ],//_teeth_on_lower_lip_open_almost_close_tongue_behind_upper_teeth    --> CAN'T BE DONE (NOT TONGUE BLENDSHAPES)

    J01: [  { type: "faceLexeme", lexeme: "JAW_SIDEWAYS_LEFT",     amount: 0.5, start: 0,   duration: 0.2 }, //{ type: "faceLexeme", lexeme: "LIP_PUCKERER_LEFT",  amount: -0.3, start: 0,   duration: 0.2} , { type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT", amount: 0.3, start: 0,   duration: 0.2 },
            { type: "faceLexeme", lexeme: "JAW_SIDEWAYS_RIGHT",    amount: 0.5, start: 0.2, duration: 0.2 }, //{ type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT", amount: -0.3, start: 0.2, duration: 0.2} , { type: "faceLexeme", lexeme: "LIP_PUCKERER_LEFT",  amount: 0.3, start: 0.2, duration: 0.2 },
            { type: "faceLexeme", lexeme: "JAW_SIDEWAYS_LEFT",     amount: 0.5, start: 0.4, duration: 0.2 }, //{ type: "faceLexeme", lexeme: "LIP_PUCKERER_LEFT",  amount: -0.3, start: 0.4, duration: 0.2} , { type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT", amount: 0.3, start: 0.4, duration: 0.2 },
            { type: "faceLexeme", lexeme: "JAW_SIDEWAYS_RIGHT",    amount: 0.5, start: 0.6, duration: 0.2 }, //{ type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT", amount: -0.3, start: 0.6, duration: 0.2} , { type: "faceLexeme", lexeme: "LIP_PUCKERER_LEFT",  amount: 0.3, start: 0.6, duration: 0.2 }
         ], //_lower_jaw_moves_sideways_left_and_right                    
    J02: [  { type: "faceLexeme", lexeme: "JAW_DROP",              amount: 0.7, start: 0,   duration: 0.6 }, { type: "faceLexeme", lexeme: "JAW_THRUST",  amount: -0.3, start: 0,   duration: 0.6 }, { type: "faceLexeme", lexeme: "MOUTH_STRETCH",  amount: -0.35, start: 0,   duration: 0.6 },
            { type: "faceLexeme", lexeme: "JAW_DROP",              amount: 0.7, start: 0.8, duration: 0.6 }, { type: "faceLexeme", lexeme: "JAW_THRUST",  amount: -0.3, start: 0.8, duration: 0.6 }, { type: "faceLexeme", lexeme: "MOUTH_STRETCH",  amount: -0.35, start: 0.8, duration: 0.6 },
            { type: "faceLexeme", lexeme: "JAW_DROP",              amount: 0.7, start: 1.6, duration: 0.6 }, { type: "faceLexeme", lexeme: "JAW_THRUST",  amount: -0.3, start: 1.6, duration: 0.6 }, { type: "faceLexeme", lexeme: "MOUTH_STRETCH",  amount: -0.35, start: 1.6, duration: 0.6 },
            { type: "faceLexeme", lexeme: "JAW_DROP",              amount: 0.7, start: 2.4, duration: 0.6 }, { type: "faceLexeme", lexeme: "JAW_THRUST",  amount: -0.3, start: 2.4, duration: 0.6 }, { type: "faceLexeme", lexeme: "MOUTH_STRETCH",  amount: -0.35, start: 2.4, duration: 0.6 },
         ], //_lower_jaw_chews_mouth_remains_closed                       
    J03: [  { type: "faceLexeme", lexeme: "JAW_THRUST",            amount: 1, start: 0, duration: 0.8 }, { type: "faceLexeme", lexeme: "JAW_DROP",  amount: 0.16, start: 0, duration: 0.8 }, { type: "faceLexeme", lexeme: "LOWER_LIP_DEPRESSOR",  amount: 0.9, start: 0,   duration: 0.8 }
         ], //_mouth_open_jaw_forward_teeth_visible                       
    J04:    { type: "speech",     text: "GA GA GA GA GA",          sentInt: 0.5, sentT: 1 }, //_mouth_open_jaw_gagaga_at_pharynx                           
          
    L02:    { type: "speech",     text: "p r r r",                 phInt: [0.2, 0.3, 0.3, 0.3], phT: [0.2, 0.05, 0.05, 0.05] }, //_prrr                                                       
    L01:    { type: "speech",     text: " S ",                     sentInt: 1.2, sentT: 0.7}, //_sh                                                         
    L03:    { type: "speech",     text: "p r",                     phInt: [0.15, 0.3], phT: [0.2, 0.2] }, //_pr                                                         
    L04:    { type: "faceLexeme", lexeme: "LIP_TIGHTENER",         amount: 0.8, start: 0,   duration: 0.8 }, //_pursed_lips                                                
    L05:    { type: "speech",     text: " Oo ",                    sentInt: 1.2, sentT: 0.8 }, //_o_oa_open_o                                                
    L06:    { type: "speech",     text: " O ",                     sentInt: 0.8, sentT: 0.8 }, //_ooo_closed_o                                               
    L07:    { type: "speech",     text: " o ",                     sentInt: 1.2, sentT: 0.7 }, //_oa                                                         
    L08:    { type: "speech",     text: "boAm ",                   phInt: [0.1, 0.3, 0.2, 0.3], phT: [0.1, 0.05, 0.05, 0.05] }, //_boam                                                       
    L09:    { type: "speech",     text: "bAm ",                    phInt: [0.1, 0.5, 0.2],  phT: [0.1, 0.1, 0.05] }, //_bam                                                        
    L10:    { type: "speech",     text: "boA A ",                  phInt: [0.5, 0.5, 1, 1], phT: [0.1, 0.05, 0.3, 0.1] }, //_boa                                                        
    L11:    { type: "speech",     text: "b A ",                    sentInt: 0.5, phT: [0.1, 0.2] }, //_ba                                                         
    L12:    { type: "speech",     text: "bii ",                    phInt: [0.1, 1, 1], phT: [0.1, 0.15, 0.5] }, //_bee                                                        
    L13:    { type: "speech",     text: "pYY ",                    phInt: [0.1, 0.6, 0.6], phT: [0.05, 0.2, 0.3] }, //_pi                                                         
    L14:    { type: "speech",     text: "pCh",                     phInt: [0.1, 1, 0.8], phT: [0.1, 0.2, 0.4] }, //_pch                                                        
    L15: [  { type: "speech",     text: "bs",                      sentInt: 0.3, sentT: 0.3 },
            { type: "faceLexeme", lexeme: "LIPS_PART",             amount: 1,  start: 0.2,     duration: 0.9 }, 
         ],//_bsss_bee                                                   
    L16:    { type: "speech",     text: "pff ",                    sentInt: 0.5, phT: [0.05, 0.2, 0.3, 0.1]}, //_pf                                                         
    L17:    { type: "speech",     text: "ppA ",                    phInt: [0.1,0.01, 0.01, 0.01], phT: [0.1, 0.1, 0.03, 0.05]}, //_p                                                          
    L18:    { type: "speech",     text: "pApApA ",                 sentInt: 0.05, sentT: 0.6 }, //_p_p_p                                                      
    L19: [  { type: "faceLexeme", lexeme: "ROUND_OPEN",        amount: 0.3, start: 0, duration: 0.6 },
            { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.9, start: 0, duration: 0.6 }
         ], //_phh                                                        
    L20: [  { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.2, start: 0, duration: 0.9 },
            { type: "faceLexeme", lexeme: "LIP_CORNER_PULLER",     amount: 0.2, start: 0, duration: 0.9 },
            { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: 0.9, start: 0, duration: 0.9 },
            
         ], //_phh                                                   
    // L21: { type: "speech", text: "", sentInt: 0.3 }, //_ph  --> NOT WORKING ON JASigning                                                       
    L22: [  { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.2, start: 0, duration: 0.4 },
            { type: "faceLexeme", lexeme: "LIP_CORNER_PULLER",     amount: 0.2, start: 0, duration: 0.4 },
            { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: 0.9, start: 0, duration: 0.4 }

         ], //_ph                                                         
    L23:    { type: "speech",     text: "mmm ",                    sentInt: 0.2 }, //_mmm                                                        
    L24:    { type: "speech",     text: "ma m ",                   phInt: [0.1, 0.05, 0.05, 0.2], phT: [0.1, 0.1, 0.05, 0.45, 0.2] }, //_mmm_while_holding_breath                                   
    L25:    { type: "speech",     text: "mamama ",                 phInt: [0.2, 0.05, 0.2, 0.05, 0.2, 0.05], sentT: 0.7 }, //_m_m_m                                                      
    L26:    { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER_RIGHT",amount: 0.8,  start: 0,   duration: 0.8 }, //_one_side_of_upper_lip_raised                               
    L27: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.25, start: 0,   duration: 0.6 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 1,    start: 0,   duration: 0.6 }
         ], //_mouth_slightly_open_tongue_to_upper_close_lips_hidden      ----> CAN'T BE DONE (NOT BLENDSHAPES FOR TONGUE)
    L28: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.5,  start: 0,   duration: 0.6 }, 
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 1,    start: 0,   duration: 0.6 }
         ], //_tongue_on_upper_lip_close_mouth_lips_hidden          ----> CAN'T BE DONE (NOT BLENDSHAPES FOR TONGUE)
    L29: [  { type: "faceLexeme", lexeme: "LIP_CORNER_DEPRESSOR",  amount: 0.15, start: 0,   duration: 0.6 }, 
            { type: "faceLexeme", lexeme: "DIMPLER",               amount: 0.6,  start: 0,   duration: 0.6 },
            { type: "faceLexeme", lexeme: "LID_TIGHTENER",         amount: 0.25, start: 0,   duration: 0.6 }
         ], //_lips_closed_hidden_mouth_corners_curved_down               
    L30: [  { type: "faceLexeme", lexeme: "LIP_CORNER_DEPRESSOR",  amount: 0.6,  start: 0,   duration: 0.7 }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.4,  start: 0,   duration: 0.7 },
            { type: "faceLexeme", lexeme: "LID_TIGHTENER",         amount: 0.25, start: 0,   duration: 0.7 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: -0.1, start: 0,   duration: 0.7 }
         ], //_lips_pursed_curved_down                                    
    L31: [  { type: "faceLexeme", lexeme: "LIP_CORNER_DEPRESSOR",  amount: 0.15, start: 0,   duration: 0.6 }, 
            { type: "faceLexeme", lexeme: "DIMPLER",               amount: 0.6,  start: 0,   duration: 0.6 },
            { type: "faceLexeme", lexeme: "LID_TIGHTENER",         amount: 0.25, start: 0,   duration: 0.6 }
         ], //_lips_closed_corners_of_mouth_curved_down        (???? --> same as L29)            
    L32: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.1,  start: 0,     duration: 0.8 }, 
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.3, start: 0.1,   duration: 0.1 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: 0.2,  start: 0.2,   duration: 0.1 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.3, start: 0.3,   duration: 0.1 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: 0.2,  start: 0.4,   duration: 0.1 },
         ], //_mouth_slightly_open_blow_lips_vibrate_initially            
    L33:    { type: "speech",     text: "A S ",                    phInt: [0.3, 0.8, 0.8, 0.8], phT: [0.1, 0.05, 0.55, 0.05] }, //_mouth_open_close_sh_with_teeth_showing                     
    L34:    { type: "faceLexeme", lexeme: "LIP_CORNER_PULLER",     amount: 0.5,  start: 0,     duration: 0.6 }, //_lips_closed_stretched_strongly                             
    L35: [  { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: -0.4, start: 0,     duration: 1.45 }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.4,  start: 0,     duration: 1.45 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.2,   duration: 0.4 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.2, start: 0.2,   duration: 0.4 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.2,   duration: 0.4 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.05, start: 0.6,   duration: 0.4 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: -0.2, start: 0.6,   duration: 0.4 },
            { type: "faceLexeme", lexeme: "LIP_SUCK_UPPER",        amount: -0.2, start: 0.6,   duration: 0.4 },
            
         ], //_blow_out_air_through_slightly_open_lips                    
    
    C01:    { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: 1,    start: 0,   duration: 0.8 }, //_puffed_cheeks                                              
    C02: [  { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: 0.8,  start: 0,   duration: 0.8 }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.2,  start: 0,   duration: 0.8 } 
         ], //_cheeks_and_lip_area_puffed                                 
    C03:    { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: 0.8,  start: 0,   duration: 0.8 }, //_gradually_puffing_cheeks  (???? --> same as C01)                                 
    C04: [  { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 1,    start: 0,   duration: 0.8 }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT",    amount: -0.2, start: 0,   duration: 0.8 } 
         ], //_one_cheek_puffed                                           
    C05: [  { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 0.8,  start: 0,   duration: 0.4 }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT",    amount: -0.2, start: 0,   duration: 0.4 } 
         ], //_one_cheek_puffed_while_briefly_blowing_out_air             
    C06: [  { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 0.8,  start: 0,   duration: 0.4 }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT",    amount: -0.2, start: 0,   duration: 0.4 } 
         ], //_one_cheek_puffed_briefly_blowing_air_cheek_pushed          (???? --> same as C05)
    C07:    { type: "faceLexeme", lexeme: "CHEEK_SUCK",            amount: 1,    start: 0,   duration: 0.8 }, //_cheeks_sucked_in                                           
    C08: [  { type: "faceLexeme", lexeme: "CHEEK_SUCK",            amount: 1,    start: 0,   duration: 0.8 }, 
            { type: "faceLexeme", lexeme: "LIP_FUNNELER",          amount: 1,    start: 0,   duration: 0.8 }
         ], //_cheeks_sucked_in_sucking_in_air                            
    // C09: { type: "speech", text: "", sentInt: 0.3 }, //_tongue_pushed_visibly_into_cheek             ----> CAN'T BE DONE (NOT BLENDSHAPES FOR TONGUE)              
    // C10: { type: "speech", text: "", sentInt: 0.3 }, //_tongue_repeatedly_pushes_into_cheek          ----> CAN'T BE DONE (NOT BLENDSHAPES FOR TONGUE)
    C11: [  { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 1,    start: 0,   duration: 0.2  }, 
            { type: "faceLexeme", lexeme: "LIP_PUCKERER_RIGHT",    amount: -0.2, start: 0,   duration: 0.85 },
            { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 1,    start: 0.2, duration: 0.2  }, 
            { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 1,    start: 0.4, duration: 0.2  }, 
            { type: "faceLexeme", lexeme: "CHEEK_BLOW_RIGHT",      amount: 1,    start: 0.6, duration: 0.25 }, 
         ], //_one_cheek_puffed_blow_out_briefly_at_corner_several_times  
    C12: [  { type: "faceLexeme", lexeme: "LIP_SUCK_LOWER",        amount: 0.8,  start: 0,   duration: 0.8  }, 
            { type: "faceLexeme", lexeme: "JAW_THRUST",            amount: 1,    start: 0,   duration: 0.8 }
         ], //_lips_closed_tongue_pushed_behind_lower_lip                 
    C13: [  { type: "faceLexeme", lexeme: "JAW_DROP",              amount: 0.3,  start: 0,   duration: 0.8 },
            { type: "faceLexeme", lexeme: "UPPER_LIP_RAISER",      amount: -0.6, start: 0,   duration: 0.8 }
        ],//_cheeks_slightly_in_jaw_down_blow_closed_lips_several_times 
    
    T01:    { type: "speech",     text: "lllll ",                  sentInt: 1,   sentT: 0.5 }, //_l                                                          
    T02: [  { type: "speech",     text: "lllll ",                  sentInt: 1,   sentT: 0.5 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.3,  start: 0 }
         ], //_tip_of_tongue_slightly_protruding                          
    // T03: { type: "speech", text: "", sentInt: 0.3 }, //_l_l_l       ---> CAN'T BE DONE (NOT TONGUE BLENDSHAPES)                                               
    T04: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.45,  start: 0,   duration: 0.4 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.5,   start: 0,   duration: 0.4 }
         ], //_tongue_sticks_out_briefly                                  
    T05: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.5,   start: 0,   duration: 1 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.55,  start: 0,   duration: 1 }
         ], //_a                                                          
    T06: [  { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.45,  start: 0,   duration: 0.35 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.5,   start: 0,   duration: 0.35 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.45,  start: 0.25,duration: 0.35 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.5,   start: 0.25,duration: 0.35 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.45,  start: 0.55,duration: 0.35 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.5,   start: 0.55,duration: 0.35 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",         amount: 0.45,  start: 0.85,duration: 0.35 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.5,   start: 0.85,duration: 0.35 }
         ], //_tongue_sticking_out_repeatedly                             
    T07:    { type: "speech",     text: "la la la la ",            phInt: [1, 1, 0.1, 1, 1, 0.1,1, 1, 0.1,1, 1, 0.1,],  sentT: 1.2 }, //_lalala                                                     
    T08:    { type: "speech",     text: "al al al al ",            phInt: [1, 1, 0.1, 1, 1, 0.1,1, 1, 0.1,1, 1, 0.1,],  sentT: 1.2 }, //_alalal                                                     
    T09:    { type: "speech",     text: "als ",                    sentInt: 0.8,  sentT: 0.6 }, //_als            --> NOT IMPLEMENTED ON JASigning                                            
    T10:    { type: "speech",     text: "llff ",                   sentInt: 0.8,  sentT: 0.6 }, //_lf                                                         
    T11:    { type: "speech",     text: "loaf ",                   sentInt: 0.5,  sentT: 0.6 }, //_laf                                                        
    // T12: { type: "speech", text: "", sentInt: 0.3 }, //_tip_of_tongue_touches_one_corner_of_the_mouth          --> CAN'T BE DONE (NOT TONGUE BLENDSHAPES)   
    T13: [  { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 0.5,   start: 0,   duration: 0.8 },
            { type: "faceLexeme", lexeme: "CHEEK_BLOW",            amount: 0.4,   start: 0,   duration: 0.8 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.2,   start: 0,   duration: 0.8 },
         ], //_tongue_tip_between_lower_lip_lower_teeth_middle_tongue_showing 
    // T14: { type: "speech", text: "", sentInt: 0.3 }, //_tip_of_tongue_is_protruded_and_moving_sidewards        --> CAN'T BE DONE (NOT TONGUE BLENDSHAPES)    
    // T15: { type: "speech", text: "", sentInt: 0.3 }, //_oval_circling_movement_of_tongue_in_open_mouth         --> CAN'T BE DONE (NOT TONGUE BLENDSHAPES)    
    T16: [  { type: "faceLexeme", lexeme: "LIP_PUCKERER",          amount: 0.8,   start: 0,   duration: 0.8 },
            { type: "faceLexeme", lexeme: "TONGUE_SHOW",           amount: 1,     start: 0,   duration: 0.8 },
            { type: "faceLexeme", lexeme: "CHIN_RAISER",           amount: -0.4,  start: 0,   duration: 0.8 },
            { type: "faceLexeme", lexeme: "MOUTH_STRETCH",            amount: 0.2,   start: 0,   duration: 0.8 },
         ], //_lips_pursed_with_tip_of_tongue_protruding                  
    // T17: { type: "speech", text: "", sentInt: 0.3 }, //_mouth_open_tongue_protrudes_briefly
}


export { sigmlStringToBML, TIMESLOT} 