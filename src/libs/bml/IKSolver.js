import * as THREE  from 'three';
import { getTwistQuaternion } from './BML.js';

class GeometricArmIK{
    constructor( skeleton, config, isLeftHand = false ){
        this._tempM4_0 = new THREE.Matrix4();
        this._tempM3_0 = new THREE.Matrix3();
        this._tempQ_0 = new THREE.Quaternion();
        this._tempQ_1 = new THREE.Quaternion();
        this._tempQ_2 = new THREE.Quaternion();
        this._tempV3_0 = new THREE.Vector3();
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();

        this.skeleton = skeleton;
        this.config = config;
        this.shoulderIndex = isLeftHand ? config.boneMap.LShoulder : config.boneMap.RShoulder;
        this.isLeftHand = !!isLeftHand;

        this.shoulderBone = this.skeleton.bones[ this.shoulderIndex ];
        this.armBone = this.skeleton.bones[ this.shoulderIndex + 1 ];
        this.elbowBone = this.skeleton.bones[ this.shoulderIndex + 2 ];
        this.wristBone = this.skeleton.bones[ this.shoulderIndex + 3 ];

        this.bindQuats = {
            shoulder: new THREE.Quaternion(), 
            arm: new THREE.Quaternion(),
            elbow: new THREE.Quaternion(),
        }
        this.beforeBindAxes = {
            shoulderRaise: new THREE.Vector3(),
            shoulderHunch: new THREE.Vector3(),
            armElevation: new THREE.Vector3(),
            armBearing: new THREE.Vector3(),
            elbow: new THREE.Vector3()
        }

        // shoulder
        let m1 = this.skeleton.boneInverses[ this.shoulderIndex ].clone().invert(); 
        let m2 = this.skeleton.boneInverses[ this.config.boneMap.ShouldersUnion ]; 
        m1.premultiply(m2);
        this.bindQuats.shoulder.setFromRotationMatrix( m1 );
        let m3 = this._tempM3_0.setFromMatrix4( this.skeleton.boneInverses[ this.shoulderIndex ] );
        this._tempV3_0.copy( this.config.axes[2] ).applyMatrix3( m3 ).normalize(); // convert mesh front axis to local coord
        this.beforeBindAxes.shoulderHunch.crossVectors( this.skeleton.bones[ this.shoulderIndex + 1 ].position, this._tempV3_0 ).normalize(); 
        this.beforeBindAxes.shoulderRaise.crossVectors( this.beforeBindAxes.shoulderHunch, this.skeleton.bones[ this.shoulderIndex + 1 ].position ).normalize(); 

        // arm
        m1 = this.skeleton.boneInverses[ this.shoulderIndex + 1 ].clone().invert();
        m2 = this.skeleton.boneInverses[ this.shoulderIndex ];
        m1.premultiply(m2);
        this.bindQuats.arm.setFromRotationMatrix( m1 );
        m3.setFromMatrix4( this.skeleton.boneInverses[ this.shoulderIndex + 1 ] );
        this._tempV3_0.copy( this.config.axes[2] ).applyMatrix3( m3 ).normalize(); // convert mesh front axis to local coord
        this.beforeBindAxes.armBearing.crossVectors( this.skeleton.bones[ this.shoulderIndex + 2 ].position, this._tempV3_0 ).normalize(); 
        this.beforeBindAxes.armElevation.crossVectors( this.beforeBindAxes.armBearing, this.skeleton.bones[ this.shoulderIndex + 2 ].position ).normalize();

        // elbow
        m1 = this.skeleton.boneInverses[ this.shoulderIndex + 2 ].clone().invert();
        m2 = this.skeleton.boneInverses[ this.shoulderIndex + 1 ];
        m1.premultiply(m2);
        this.bindQuats.elbow.setFromRotationMatrix( m1 );
        m3.setFromMatrix4( this.skeleton.boneInverses[ this.shoulderIndex + 2 ] );
        this._tempV3_0.addVectors( this.config.axes[2], this.config.axes[1] ).applyMatrix3( m3 ).normalize(); // convert mesh front axis to local coord
        this.beforeBindAxes.elbow.crossVectors( this.skeleton.bones[ this.shoulderIndex + 3 ].position, this._tempV3_0 ).normalize();
        
        // put in tpose
        this.shoulderBone.quaternion.copy( this.bindQuats.shoulder );
        this.armBone.quaternion.copy( this.bindQuats.arm );
        this.elbowBone.quaternion.copy( this.bindQuats.elbow );

        this.armBone.getWorldPosition( this._tempV3_0 ); // getWorldPosition updates matrices
        this.elbowBone.getWorldPosition( this._tempV3_1 );
        this.wristBone.getWorldPosition( this._tempV3_2 );        
        let v = new THREE.Vector3();
        this.armWorldSize = v.subVectors( this._tempV3_2, this._tempV3_0 ).length(); // not the same as upperarm + forearm as these bones may not be completely straight due to rigging reasons
        this.upperarmWSize = v.subVectors( this._tempV3_1, this._tempV3_0 ).length();
        this.forearmWSize = v.subVectors( this._tempV3_2, this._tempV3_1 ).length();
    }
    
    reachTarget( targetWorldPoint, forcedElbowRaiseDelta = 0, forcedShoulderRaise = 0, forcedShoulderHunch = 0, armTwistCorrection = true ){
        let wristBone = this.wristBone;
        let elbowBone = this.elbowBone;
        let armBone = this.armBone;
        let shoulderBone = this.shoulderBone;

        // set tpose quaternions, so regardless of skeleton base pose (no rotations), every avatar starts at the same pose
        shoulderBone.quaternion.copy( this.bindQuats.shoulder );
        armBone.quaternion.copy( this.bindQuats.arm );
        elbowBone.quaternion.copy( this.bindQuats.elbow );
        wristBone.updateWorldMatrix( true, false );

        let armWPos = this._tempV3_2.setFromMatrixPosition( armBone.matrixWorld );

        /** Shoulder Raise and Hunch */
        this._tempV3_1.subVectors( targetWorldPoint, armWPos ); // direction with respect to arm Bone. World coords
        this._tempM4_0.multiplyMatrices( this.shoulderBone.matrixWorld, this.skeleton.boneInverses[ this.shoulderIndex ] ); // mesh to world coordinates
        let meshToWorldMat3 = this._tempM3_0.setFromMatrix4( this._tempM4_0 ); // just for directions
        this._tempV3_0.copy( this.config.axes[0] ).applyMatrix3( meshToWorldMat3 ).normalize(); // convert horizontal axis from mesh to world coords from shoulder perspective
        this._tempV3_0.multiplyScalar( this.isLeftHand ? -1: 1 );
        let shoulderHunchFactor = ( 0.5 + this._tempV3_0.dot( this._tempV3_1 ) / this.armWorldSize ) / 1.5;
        this._tempV3_0.copy( this.config.axes[1] ).applyMatrix3( meshToWorldMat3 ).normalize(); // convert vertical axis from mesh to world coords from shoulder perspective
        let shoulderRaiseFactor = ( 0.5 + this._tempV3_0.dot( this._tempV3_1 ) / this.armWorldSize ) /  1.5;

        let shoulderHunchAngle = Math.max( -10, Math.min( 40, 40 * ( shoulderHunchFactor * shoulderHunchFactor * Math.sign( shoulderHunchFactor ) ) ) ) * Math.PI/180;
        shoulderHunchAngle += forcedShoulderHunch; 
        let shoulderRaiseAngle = Math.max( -10, Math.min( 45, 45 * ( shoulderRaiseFactor * shoulderRaiseFactor * Math.sign( shoulderRaiseFactor ) ) ) ) * Math.PI/180;
        shoulderRaiseAngle += forcedShoulderRaise; 
        shoulderRaiseAngle *= this.isLeftHand ? 1 : -1;
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.shoulderHunch,  shoulderHunchAngle );
        this.shoulderBone.quaternion.multiply( this._tempQ_0 );
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.shoulderRaise, shoulderRaiseAngle );
        this.shoulderBone.quaternion.multiply( this._tempQ_0 );
        
        wristBone.updateWorldMatrix( true, false ); // TODO should be only wrist, elbow, arm, shoulder
        armWPos = this._tempV3_1.setFromMatrixPosition( armBone.matrixWorld ); // update arm position 
        let wristArmAxis = this._tempV3_1;
        let elbowRaiseQuat = this._tempQ_1;
        let armElevationBearingQuat = this._tempQ_2;

        /** Elbow */
        // Law of cosines   c^2 = a^2 + b^2 - 2ab * Cos(C)
        this._tempV3_0.subVectors( targetWorldPoint, armWPos );
        let a = this.forearmWSize; let b = this.upperarmWSize; let cc = this._tempV3_0.lengthSq(); 
        let elbowAngle = Math.acos( Math.max( -1, Math.min( 1, ( cc - a*a - b*b ) / ( -2 * a * b ) ) ) );
        cc = this.armWorldSize * this.armWorldSize;
        let defaultAngle = Math.acos( Math.max( -1, Math.min( 1, ( cc - a*a - b*b ) / ( -2 * a * b ) ) ) ); // angle from forearm-upperarm tpose misalignment
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.elbow, defaultAngle - elbowAngle ); // ( Math.PI - elbowAngle ) - ( Math.PI - defaultAngle )
        elbowBone.quaternion.multiply( this._tempQ_0 )

        /** ElbowRaise Computation */
        elbowBone.updateMatrix();
        wristArmAxis.copy( wristBone.position ).applyMatrix4( elbowBone.matrix ).normalize(); // axis in "before bind" space
        let elbowRaiseAngle = ( -40 * Math.PI/180 ) * ( 1 - elbowAngle / Math.PI ); // default angle 
        elbowRaiseAngle += forcedElbowRaiseDelta;
        elbowRaiseAngle *= ( this.isLeftHand ? 1 : -1 ); // due to how axis is computed, angle for right arm is inverted
        elbowRaiseQuat.setFromAxisAngle( wristArmAxis, elbowRaiseAngle );

        /** Arm Computation */
        armBone.updateWorldMatrix( false, false ); // only update required is for the arm
        let wToLArm = this._tempM4_0.copy( this.armBone.matrixWorld ).invert();
        let targetLocalDir = this._tempV3_0.copy( targetWorldPoint ).applyMatrix4( wToLArm ).normalize();
        
        // elevation from plane xz. Bearing through Y being Z the 0º axis
        // due to how elevation axis is computed and how quats rotate, elevation angle needs to be negated
        let targetProj = { x: this.beforeBindAxes.armElevation.dot( targetLocalDir ), y: this.beforeBindAxes.armBearing.dot( targetLocalDir ), z: elbowBone.position.dot( targetLocalDir ) / elbowBone.position.length() };
        let targetAngles = { elevation: - Math.asin( targetProj.y ), bearing: Math.atan2( targetProj.x, targetProj.z ) };
        let sourceProj = { x: this.beforeBindAxes.armElevation.dot( wristArmAxis ), y: this.beforeBindAxes.armBearing.dot( wristArmAxis ), z: elbowBone.position.dot( wristArmAxis ) / elbowBone.position.length() };
        let sourceAngles = { elevation: - Math.asin( sourceProj.y ), bearing: Math.atan2( sourceProj.x, sourceProj.z ) };
            
        armElevationBearingQuat.set(0,0,0,1);
        // align wrist with z axis
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.armBearing, - sourceAngles.bearing );
        armElevationBearingQuat.premultiply( this._tempQ_0 );
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.armElevation, - sourceAngles.elevation );
        armElevationBearingQuat.premultiply( this._tempQ_0 );
        // from z axis move to target
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.armElevation, targetAngles.elevation );
        armElevationBearingQuat.premultiply( this._tempQ_0 );
        this._tempQ_0.setFromAxisAngle( this.beforeBindAxes.armBearing, targetAngles.bearing );
        armElevationBearingQuat.premultiply( this._tempQ_0 );
        
        /** Arm and ElbowRaise apply */
        armBone.quaternion.multiply( armElevationBearingQuat );
        armBone.quaternion.multiply( elbowRaiseQuat ); // elbowraiseQuat is computed in before bind before arm movement space
        if ( armTwistCorrection ) this._correctArmTwist();

    }

    // remove arm twisting and insert it into elbow. Just for aesthetics
    _correctArmTwist(){
        // remove arm twisting and insert it into elbow
        // (quaternions) R = S * T ---> T = normalize( [ Wr, proj(Vr) ] ) where proj(Vr) projection into some arbitrary twist axis
        let twistq = this._tempQ_0;
        let armQuat = this._tempQ_1.copy( this.bindQuats.arm ).invert().multiply( this.armBone.quaternion ); // armbone = ( bind * armMovement ). Remove bind
        let twistAxis = this._tempV3_0.copy( this.elbowBone.position ).normalize();
        getTwistQuaternion( armQuat, twistAxis, twistq );
        this.elbowBone.quaternion.premultiply( twistq );
        this.armBone.quaternion.multiply( twistq.invert() );

        // previous fix might induce some twisting in forearm. remove forearm twisting. Keep only swing rotation
        twistAxis = this._tempV3_0.copy( this.wristBone.position ).normalize();
        getTwistQuaternion( this.elbowBone.quaternion, twistAxis, twistq );
        this.elbowBone.quaternion.multiply( twistq.invert() );
    }
}

export { GeometricArmIK} 