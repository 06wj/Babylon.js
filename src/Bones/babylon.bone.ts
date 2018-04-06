﻿module BABYLON {
    /** 
     * Class used to store bone information
     * @see http://doc.babylonjs.com/how_to/how_to_use_bones_and_skeletons
     */
    export class Bone extends Node {

        private static _tmpVecs: Vector3[] = [Vector3.Zero(), Vector3.Zero()];
        private static _tmpQuat = Quaternion.Identity();
        private static _tmpMats: Matrix[] = [Matrix.Identity(), Matrix.Identity(), Matrix.Identity(), Matrix.Identity(), Matrix.Identity()];

        /**
         * Gets the list of child bones
         */
        public children = new Array<Bone>();

        /** Gets the animations associated with this bone */
        public animations = new Array<Animation>();

        /**
         * Gets or sets bone length
         */
        public length: number;

        /** 
         * @ignore Internal only
         * Set this value to map this bone to a different index in the transform matrices
         * Set this value to -1 to exclude the bone from the transform matrices
         */
        public _index: Nullable<number> = null;

        private _skeleton: Skeleton;
        private _localMatrix: Matrix;
        private _restPose: Matrix;
        private _baseMatrix: Matrix;
        private _absoluteTransform = new Matrix();
        private _invertedAbsoluteTransform = new Matrix();
        private _parent: Nullable<Bone>;
        private _scalingDeterminant = 1;
        private _worldTransform = new Matrix();
        
        private _localScaling: Vector3;
        private _localRotation: Quaternion;
        private _localPosition: Vector3;
        private _needToDecompose = true;
        private _needToCompose = false;

        /** @ignore */
        get _matrix(): Matrix {
            this._compose();
            return this._localMatrix;
        }

        /** @ignore */
        set _matrix(value: Matrix) {
            this._localMatrix.copyFrom(value);
            this._needToDecompose = true;
        }

        /**
         * Create a new bone
         * @param name defines the bone name
         * @param skeleton defines the parent skeleton
         * @param parentBone defines the parent (can be null if the bone is the root)
         * @param localMatrix defines the local matrix
         * @param restPose defines the rest pose matrix
         * @param baseMatrix defines the base matrix
         * @param index defines index of the bone in the hiearchy
         */
        constructor(
            /**
             * defines the bone name
             */
            public name: string, skeleton: Skeleton, parentBone: Nullable<Bone> = null, localMatrix: Nullable<Matrix> = null,
            restPose: Nullable<Matrix> = null, baseMatrix: Nullable<Matrix> = null, index: Nullable<number> = null) {
            super(name, skeleton.getScene());
            this._skeleton = skeleton;
            this._localMatrix = localMatrix ? localMatrix.clone() : Matrix.Identity();
            this._restPose = restPose ? restPose : this._localMatrix.clone();
            this._baseMatrix = baseMatrix ? baseMatrix : this._localMatrix.clone();
            this._index = index;

            skeleton.bones.push(this);

            this.setParent(parentBone, false);

            this._updateDifferenceMatrix();
        }

        // Members

        /**
         * Gets the parent skeleton
         * @returns a skeleton
         */
        public getSkeleton(): Skeleton {
            return this._skeleton;
        }

        /**
         * Gets parent bone
         * @returns a bone or null if the bone is the root of the bone hierarchy
         */
        public getParent(): Nullable<Bone> {
            return this._parent;
        }

        /**
         * Sets the parent bone
         * @param parent defines the parent (can be null if the bone is the root) 
         * @param updateDifferenceMatrix defines if the difference matrix must be updated
         */
        public setParent(parent: Nullable<Bone>, updateDifferenceMatrix: boolean = true): void {
            if (this._parent === parent) {
                return;
            }

            if (this._parent) {
                var index = this._parent.children.indexOf(this);
                if (index !== -1) {
                    this._parent.children.splice(index, 1);
                }
            }

            this._parent = parent;

            if (this._parent) {
                this._parent.children.push(this);
            }

            if (updateDifferenceMatrix) {
                this._updateDifferenceMatrix();
            }

            this.markAsDirty();
        }

        /**
         * Gets the local matrix
         * @returns a matrix
         */
        public getLocalMatrix(): Matrix {
            this._compose();
            return this._localMatrix;
        }

        /**
         * Gets the base matrix (initial matrix which remains unchanged)
         * @returns a matrix
         */
        public getBaseMatrix(): Matrix {
            return this._baseMatrix;
        }

        /**
         * Gets the rest pose matrix
         * @returns a matrix
         */
        public getRestPose(): Matrix {
            return this._restPose;
        }

        /**
         * Gets a matrix used to store world matrix (ie. the matrix sent to shaders)
         */
        public getWorldMatrix(): Matrix {
            return this._worldTransform;
        }

        /**
         * Sets the local matrix to rest pose matrix
         */
        public returnToRest(): void {
            this.updateMatrix(this._restPose.clone());
        }

        /**
         * Gets the inverse of the absolute transform matrix.
         * This matrix will be multiplied by local matrix to get the difference matrix (ie. the difference between original state and current state)
         * @returns a matrix
         */
        public getInvertedAbsoluteTransform(): Matrix {
            return this._invertedAbsoluteTransform;
        }

        /**
         * Gets the absolute transform matrix (ie base matrix * parent world matrix)
         * @returns a matrix
         */
        public getAbsoluteTransform(): Matrix {
            return this._absoluteTransform;
        }

        // Properties (matches AbstractMesh properties)

        /** Gets or sets current position (in local space) */
        public get position(): Vector3 {
            this._decompose();
            return this._localPosition;
        }

        public set position(newPosition: Vector3) {
            this._decompose();
            this._localPosition.copyFrom(newPosition);
            
            this._markAsDirtyAndCompose();
        }

        /** Gets or sets current rotation (in local space) */
        public get rotation(): Vector3 {
            return this.getRotation();
        }

        public set rotation(newRotation: Vector3) {
            this.setRotation(newRotation);
        }

        /** Gets or sets current rotation quaternion (in local space) */
        public get rotationQuaternion() {
            this._decompose();
            return this._localRotation;
        }

        public set rotationQuaternion(newRotation: Quaternion) {
            this.setRotationQuaternion(newRotation);
        }

        /** Gets or sets current scaling (in local space) */
        public get scaling(): Vector3 {
            return this.getScale();
        }

        public set scaling(newScaling: Vector3) {
            this.setScale(newScaling);
        }

        /**
         * Gets the animation properties override
         */
        public get animationPropertiesOverride(): Nullable<AnimationPropertiesOverride> {
            return this._skeleton.animationPropertiesOverride;
        }

        // Methods
        private _decompose() {
            if (!this._needToDecompose) {
                return;
            }

            this._needToDecompose = false;

            if (!this._localScaling) {
                this._localScaling = Vector3.Zero();
                this._localRotation = Quaternion.Zero();
                this._localPosition = Vector3.Zero();
            }
            this._localMatrix.decompose(this._localScaling, this._localRotation, this._localPosition);
        }

        private _compose() {
            if (!this._needToCompose) {
                return;
            }

            this._needToCompose = false;
            Matrix.ComposeToRef(this._localScaling, this._localRotation, this._localPosition, this._localMatrix);
        }

        /**
         * Update the local matrix
         * @param matrix defines the new local matrix
         * @param updateDifferenceMatrix defines if the difference matrix must be updated
         */
        public updateMatrix(matrix: Matrix, updateDifferenceMatrix = true): void {
            this._baseMatrix.copyFrom(matrix);
            this._localMatrix.copyFrom(matrix);

            if (updateDifferenceMatrix) {
                this._updateDifferenceMatrix();
            }

            this._markAsDirtyAndDecompose();
        }

        /** @ignore */
        public _updateDifferenceMatrix(rootMatrix?: Matrix): void {
            if (!rootMatrix) {
                rootMatrix = this._baseMatrix;
            }

            if (this._parent) {
                rootMatrix.multiplyToRef(this._parent._absoluteTransform, this._absoluteTransform);
            } else {
                this._absoluteTransform.copyFrom(rootMatrix);
            }

            this._absoluteTransform.invertToRef(this._invertedAbsoluteTransform);

            for (var index = 0; index < this.children.length; index++) {
                this.children[index]._updateDifferenceMatrix();
            }

            this._scalingDeterminant = (this._absoluteTransform.determinant() < 0 ? -1 : 1);
        }

        /**
         * Flag the bone as dirty (Forcing it to update everything)
         */
        public markAsDirty(): void {
            this._currentRenderId++;
            this._childRenderId++;
            this._skeleton._markAsDirty();
        }

        private _markAsDirtyAndCompose() {
            this.markAsDirty();
            this._needToCompose = true;
        }

        private _markAsDirtyAndDecompose() {
            this.markAsDirty();            
            this._needToDecompose = true;
        }

        /**
         * Copy an animation range from another bone
         * @param source defines the source bone
         * @param rangeName defines the range name to copy
         * @param frameOffset defines the frame offset
         * @param rescaleAsRequired defines if rescaling must be applied if required
         * @param skelDimensionsRatio defines the scaling ratio
         * @returns true if operation was successful
         */
        public copyAnimationRange(source: Bone, rangeName: string, frameOffset: number, rescaleAsRequired = false, skelDimensionsRatio: Nullable<Vector3> = null): boolean {
            // all animation may be coming from a library skeleton, so may need to create animation
            if (this.animations.length === 0) {
                this.animations.push(new Animation(this.name, "_matrix", source.animations[0].framePerSecond, Animation.ANIMATIONTYPE_MATRIX, 0));
                this.animations[0].setKeys([]);
            }

            // get animation info / verify there is such a range from the source bone
            var sourceRange = source.animations[0].getRange(rangeName);
            if (!sourceRange) {
                return false;
            }
            var from = sourceRange.from;
            var to = sourceRange.to;
            var sourceKeys = source.animations[0].getKeys();

            // rescaling prep
            var sourceBoneLength = source.length;
            var sourceParent = source.getParent();
            var parent = this.getParent();
            var parentScalingReqd = rescaleAsRequired && sourceParent && sourceBoneLength && this.length && sourceBoneLength !== this.length;
            var parentRatio = parentScalingReqd && parent && sourceParent ? parent.length / sourceParent.length : 1;

            var dimensionsScalingReqd = rescaleAsRequired && !parent && skelDimensionsRatio && (skelDimensionsRatio.x !== 1 || skelDimensionsRatio.y !== 1 || skelDimensionsRatio.z !== 1);

            var destKeys = this.animations[0].getKeys();

            // loop vars declaration
            var orig: { frame: number, value: Matrix };
            var origTranslation: Vector3;
            var mat: Matrix;

            for (var key = 0, nKeys = sourceKeys.length; key < nKeys; key++) {
                orig = sourceKeys[key];
                if (orig.frame >= from && orig.frame <= to) {
                    if (rescaleAsRequired) {
                        mat = orig.value.clone();

                        // scale based on parent ratio, when bone has parent
                        if (parentScalingReqd) {
                            origTranslation = mat.getTranslation();
                            mat.setTranslation(origTranslation.scaleInPlace(parentRatio));

                            // scale based on skeleton dimension ratio when root bone, and value is passed
                        } else if (dimensionsScalingReqd && skelDimensionsRatio) {
                            origTranslation = mat.getTranslation();
                            mat.setTranslation(origTranslation.multiplyInPlace(skelDimensionsRatio));

                            // use original when root bone, and no data for skelDimensionsRatio
                        } else {
                            mat = orig.value;
                        }
                    } else {
                        mat = orig.value;
                    }
                    destKeys.push({ frame: orig.frame + frameOffset, value: mat });
                }
            }
            this.animations[0].createRange(rangeName, from + frameOffset, to + frameOffset);
            return true;
        }

        /**
         * Translate the bone in local or world space
         * @param vec The amount to translate the bone
         * @param space The space that the translation is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         */
        public translate(vec: Vector3, space = Space.LOCAL, mesh?: AbstractMesh): void {
            var lm = this.getLocalMatrix();

            if (space == Space.LOCAL) {
                lm.m[12] += vec.x;
                lm.m[13] += vec.y;
                lm.m[14] += vec.z;
            } else {
                var wm: Nullable<Matrix> = null;

                //mesh.getWorldMatrix() needs to be called before skeleton.computeAbsoluteTransforms()
                if (mesh) {
                    wm = mesh.getWorldMatrix();
                }

                this._skeleton.computeAbsoluteTransforms();
                var tmat = Bone._tmpMats[0];
                var tvec = Bone._tmpVecs[0];

                if (this._parent) {
                    if (mesh && wm) {
                        tmat.copyFrom(this._parent.getAbsoluteTransform());
                        tmat.multiplyToRef(wm, tmat);
                    } else {
                        tmat.copyFrom(this._parent.getAbsoluteTransform());
                    }
                }

                tmat.m[12] = 0;
                tmat.m[13] = 0;
                tmat.m[14] = 0;

                tmat.invert();
                Vector3.TransformCoordinatesToRef(vec, tmat, tvec);

                lm.m[12] += tvec.x;
                lm.m[13] += tvec.y;
                lm.m[14] += tvec.z;

            }

            this._markAsDirtyAndDecompose();
        }

        /**
         * Set the postion of the bone in local or world space
         * @param position The position to set the bone
         * @param space The space that the position is in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         */
        public setPosition(position: Vector3, space = Space.LOCAL, mesh?: AbstractMesh): void {
            var lm = this.getLocalMatrix();

            if (space == Space.LOCAL) {
                lm.m[12] = position.x;
                lm.m[13] = position.y;
                lm.m[14] = position.z;
            } else {
                var wm: Nullable<Matrix> = null;

                //mesh.getWorldMatrix() needs to be called before skeleton.computeAbsoluteTransforms()
                if (mesh) {
                    wm = mesh.getWorldMatrix();
                }

                this._skeleton.computeAbsoluteTransforms();

                var tmat = Bone._tmpMats[0];
                var vec = Bone._tmpVecs[0];

                if (this._parent) {
                    if (mesh && wm) {
                        tmat.copyFrom(this._parent.getAbsoluteTransform());
                        tmat.multiplyToRef(wm, tmat);
                    } else {
                        tmat.copyFrom(this._parent.getAbsoluteTransform());
                    }
                }

                tmat.invert();
                Vector3.TransformCoordinatesToRef(position, tmat, vec);

                lm.m[12] = vec.x;
                lm.m[13] = vec.y;
                lm.m[14] = vec.z;

            }

            this._markAsDirtyAndDecompose();
        }

        /**
         * Set the absolute position of the bone (world space)
         * @param position The position to set the bone
         * @param mesh The mesh that this bone is attached to
         */
        public setAbsolutePosition(position: Vector3, mesh?: AbstractMesh) {
            this.setPosition(position, Space.WORLD, mesh);
        }

        /**
         * Scale the bone on the x, y and z axes (in local space)
         * @param x The amount to scale the bone on the x axis
         * @param y The amount to scale the bone on the y axis
         * @param z The amount to scale the bone on the z axis
         * @param scaleChildren sets this to true if children of the bone should be scaled as well (false by default)
         */
        public scale(x: number, y: number, z: number, scaleChildren = false): void {
            var locMat = this.getLocalMatrix();

            // Apply new scaling on top of current local matrix
            var scaleMat = Bone._tmpMats[0];
            Matrix.ScalingToRef(x, y, z, scaleMat);
            scaleMat.multiplyToRef(locMat, locMat);

            // Invert scaling matrix and apply the inverse to all children
            scaleMat.invert();

            for (var child of this.children) {
                var cm = child.getLocalMatrix();
                cm.multiplyToRef(scaleMat, cm);

                child._markAsDirtyAndDecompose();
            }

            this._markAsDirtyAndDecompose();

            if (scaleChildren) {
                for (var child of this.children) {
                    child.scale(x, y, z, scaleChildren);
                }
            }
        }

        /**
         * Set the bone scaling in local space
         * @param scale defines the scaling vector
         */
        public setScale(scale: Vector3): void {          
            this._decompose();
            this._localScaling.copyFrom(scale);
            this._markAsDirtyAndCompose();
        }    
        
        /**
         * Gets the current scaling in local space
         * @returns the current scaling vector
         */
        public getScale(): Vector3 {
            this._decompose();
            return this._localScaling;
        }

        /**
         * Gets the current scaling in local space and stores it in a target vector
         * @param result defines the target vector
         */
        public getScaleToRef(result: Vector3) {
            this._decompose();
            result.copyFrom(this._localScaling);
        }        

        /**
         * Set the yaw, pitch, and roll of the bone in local or world space
         * @param yaw The rotation of the bone on the y axis
         * @param pitch The rotation of the bone on the x axis
         * @param roll The rotation of the bone on the z axis
         * @param space The space that the axes of rotation are in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         */
        public setYawPitchRoll(yaw: number, pitch: number, roll: number, space = Space.LOCAL, mesh?: AbstractMesh): void {
            if (space === Space.LOCAL) {
                var quat = Bone._tmpQuat;
                Quaternion.RotationYawPitchRollToRef(yaw, pitch, roll, quat);                
                this.setRotationQuaternion(quat, space, mesh);
                return;
            }

            var rotMatInv = Bone._tmpMats[0];
            if (!this._getNegativeRotationToRef(rotMatInv, mesh)) {
                return;
            }

            var rotMat = Bone._tmpMats[1];
            Matrix.RotationYawPitchRollToRef(yaw, pitch, roll, rotMat);

            rotMatInv.multiplyToRef(rotMat, rotMat);
            this._rotateWithMatrix(rotMat, space, mesh);

        }

        /**
         * Add a rotation to the bone on an axis in local or world space
         * @param axis The axis to rotate the bone on
         * @param amount The amount to rotate the bone
         * @param space The space that the axis is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         */
        public rotate(axis: Vector3, amount: number, space = Space.LOCAL, mesh?: AbstractMesh): void {
            var rmat = Bone._tmpMats[0];
            rmat.m[12] = 0;
            rmat.m[13] = 0;
            rmat.m[14] = 0;

            Matrix.RotationAxisToRef(axis, amount, rmat);

            this._rotateWithMatrix(rmat, space, mesh);
        }

        /**
         * Set the rotation of the bone to a particular axis angle in local or world space
         * @param axis The axis to rotate the bone on
         * @param angle The angle that the bone should be rotated to
         * @param space The space that the axis is in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         */
        public setAxisAngle(axis: Vector3, angle: number, space = Space.LOCAL, mesh?: AbstractMesh): void {
            if (space === Space.LOCAL) {
                var quat = Bone._tmpQuat;
                Quaternion.RotationAxisToRef(axis, angle, quat);
    
                this.setRotationQuaternion(quat, space, mesh);
                return;
            }

            var rotMatInv = Bone._tmpMats[0];
            if (!this._getNegativeRotationToRef(rotMatInv, mesh)) {
                return;
            }

            var rotMat = Bone._tmpMats[1];
            Matrix.RotationAxisToRef(axis, angle, rotMat);

            rotMatInv.multiplyToRef(rotMat, rotMat);
            this._rotateWithMatrix(rotMat, space, mesh);
        }

        /**
         * Set the euler rotation of the bone in local of world space
         * @param rotation The euler rotation that the bone should be set to
         * @param space The space that the rotation is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         */
        public setRotation(rotation: Vector3, space = Space.LOCAL, mesh?: AbstractMesh): void {
            this.setYawPitchRoll(rotation.y, rotation.x, rotation.z, space, mesh);
        }

        /**
         * Set the quaternion rotation of the bone in local of world space
         * @param quat The quaternion rotation that the bone should be set to
         * @param space The space that the rotation is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         */
        public setRotationQuaternion(quat: Quaternion, space = Space.LOCAL, mesh?: AbstractMesh): void {
            if (space === Space.LOCAL) {
                this._decompose();
                this._localRotation.copyFrom(quat);

                this._markAsDirtyAndCompose();
    
                return;
            }

            var rotMatInv = Bone._tmpMats[0];
            if (!this._getNegativeRotationToRef(rotMatInv, mesh)) {
                return;
            }

            var rotMat = Bone._tmpMats[1];
            Matrix.FromQuaternionToRef(quat, rotMat);

            rotMatInv.multiplyToRef(rotMat, rotMat);

            this._rotateWithMatrix(rotMat, space, mesh);

        }

        /**
         * Set the rotation matrix of the bone in local of world space
         * @param rotMat The rotation matrix that the bone should be set to
         * @param space The space that the rotation is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         */
        public setRotationMatrix(rotMat: Matrix, space = Space.LOCAL, mesh?: AbstractMesh): void {
            if (space === Space.LOCAL) {
                var quat = Bone._tmpQuat;
                Quaternion.FromRotationMatrixToRef(rotMat, quat);
                this.setRotationQuaternion(quat, space, mesh);
                return;
            }

            var rotMatInv = Bone._tmpMats[0];
            if (!this._getNegativeRotationToRef(rotMatInv, mesh)) {
                return;
            }

            var rotMat2 = Bone._tmpMats[1];
            rotMat2.copyFrom(rotMat);

            rotMatInv.multiplyToRef(rotMat, rotMat2);

            this._rotateWithMatrix(rotMat2, space, mesh);

        }

        private _rotateWithMatrix(rmat: Matrix, space = Space.LOCAL, mesh?: AbstractMesh): void {
            var lmat = this.getLocalMatrix();
            var lx = lmat.m[12];
            var ly = lmat.m[13];
            var lz = lmat.m[14];
            var parent = this.getParent();
            var parentScale = Bone._tmpMats[3];
            var parentScaleInv = Bone._tmpMats[4];

            if (parent && space == Space.WORLD) {
                if (mesh) {
                    parentScale.copyFrom(mesh.getWorldMatrix());
                    parent.getAbsoluteTransform().multiplyToRef(parentScale, parentScale);
                } else {
                    parentScale.copyFrom(parent.getAbsoluteTransform());
                }
                parentScaleInv.copyFrom(parentScale);
                parentScaleInv.invert();
                lmat.multiplyToRef(parentScale, lmat);
                lmat.multiplyToRef(rmat, lmat);
                lmat.multiplyToRef(parentScaleInv, lmat);
            } else {
                if (space == Space.WORLD && mesh) {
                    parentScale.copyFrom(mesh.getWorldMatrix());
                    parentScaleInv.copyFrom(parentScale);
                    parentScaleInv.invert();
                    lmat.multiplyToRef(parentScale, lmat);
                    lmat.multiplyToRef(rmat, lmat);
                    lmat.multiplyToRef(parentScaleInv, lmat);
                } else {
                    lmat.multiplyToRef(rmat, lmat);
                }
            }

            lmat.m[12] = lx;
            lmat.m[13] = ly;
            lmat.m[14] = lz;

            this.computeAbsoluteTransforms();
            this._markAsDirtyAndDecompose();
        }

        private _getNegativeRotationToRef(rotMatInv: Matrix, mesh?: AbstractMesh): boolean {
            var scaleMatrix = Bone._tmpMats[2];
            rotMatInv.copyFrom(this.getAbsoluteTransform());

            if (mesh) {
                rotMatInv.multiplyToRef(mesh.getWorldMatrix(), rotMatInv);
                Matrix.ScalingToRef(mesh.scaling.x, mesh.scaling.y, mesh.scaling.z, scaleMatrix);
            }

            rotMatInv.invert();
            if (isNaN(rotMatInv.m[0])) {
                // Matrix failed to invert.
                // This can happen if scale is zero for example.
                return false;
            }

            scaleMatrix.m[0] *= this._scalingDeterminant;
            rotMatInv.multiplyToRef(scaleMatrix, rotMatInv);

            return true;
        }

        /**
         * Get the position of the bone in local or world space
         * @param space The space that the returned position is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         * @returns The position of the bone
         */
        public getPosition(space = Space.LOCAL, mesh: Nullable<AbstractMesh> = null): Vector3 {
            var pos = Vector3.Zero();

            this.getPositionToRef(space, mesh, pos);

            return pos;
        }

        /**
         * Copy the position of the bone to a vector3 in local or world space
         * @param space The space that the returned position is in
         * @param mesh The mesh that this bone is attached to. This is only used in world space
         * @param result The vector3 to copy the position to
         */
        public getPositionToRef(space = Space.LOCAL, mesh: Nullable<AbstractMesh>, result: Vector3): void {
            if (space == Space.LOCAL) {
                var lm = this.getLocalMatrix();

                result.x = lm.m[12];
                result.y = lm.m[13];
                result.z = lm.m[14];
            } else {
                var wm: Nullable<Matrix> = null;

                //mesh.getWorldMatrix() needs to be called before skeleton.computeAbsoluteTransforms()
                if (mesh) {
                    wm = mesh.getWorldMatrix();
                }

                this._skeleton.computeAbsoluteTransforms();

                var tmat = Bone._tmpMats[0];

                if (mesh && wm) {
                    tmat.copyFrom(this.getAbsoluteTransform());
                    tmat.multiplyToRef(wm, tmat);
                } else {
                    tmat = this.getAbsoluteTransform();
                }

                result.x = tmat.m[12];
                result.y = tmat.m[13];
                result.z = tmat.m[14];
            }
        }

        /**
         * Get the absolute position of the bone (world space)
         * @param mesh The mesh that this bone is attached to
         * @returns The absolute position of the bone
         */
        public getAbsolutePosition(mesh: Nullable<AbstractMesh> = null): Vector3 {
            var pos = Vector3.Zero();

            this.getPositionToRef(Space.WORLD, mesh, pos);

            return pos;
        }

        /**
         * Copy the absolute position of the bone (world space) to the result param
         * @param mesh The mesh that this bone is attached to
         * @param result The vector3 to copy the absolute position to
         */
        public getAbsolutePositionToRef(mesh: AbstractMesh, result: Vector3) {
            this.getPositionToRef(Space.WORLD, mesh, result);
        }

        /**
         * Compute the absolute transforms of this bone and its children
         */
        public computeAbsoluteTransforms(): void {
            this._compose();

            if (this._parent) {
                this._localMatrix.multiplyToRef(this._parent._absoluteTransform, this._absoluteTransform);
            } else {
                this._absoluteTransform.copyFrom(this._localMatrix);

                var poseMatrix = this._skeleton.getPoseMatrix();

                if (poseMatrix) {
                    this._absoluteTransform.multiplyToRef(poseMatrix, this._absoluteTransform);
                }
            }

            var children = this.children;
            var len = children.length;

            for (var i = 0; i < len; i++) {
                children[i].computeAbsoluteTransforms();
            }
        }

        /**
         * Get the world direction from an axis that is in the local space of the bone
         * @param localAxis The local direction that is used to compute the world direction
         * @param mesh The mesh that this bone is attached to
         * @returns The world direction
         */
        public getDirection(localAxis: Vector3, mesh: Nullable<AbstractMesh> = null): Vector3 {
            var result = Vector3.Zero();

            this.getDirectionToRef(localAxis, mesh, result);

            return result;
        }

        /**
         * Copy the world direction to a vector3 from an axis that is in the local space of the bone
         * @param localAxis The local direction that is used to compute the world direction
         * @param mesh The mesh that this bone is attached to
         * @param result The vector3 that the world direction will be copied to
         */
        public getDirectionToRef(localAxis: Vector3, mesh: Nullable<AbstractMesh> = null, result: Vector3): void {
            var wm: Nullable<Matrix> = null;

            //mesh.getWorldMatrix() needs to be called before skeleton.computeAbsoluteTransforms()
            if (mesh) {
                wm = mesh.getWorldMatrix();
            }

            this._skeleton.computeAbsoluteTransforms();

            var mat = Bone._tmpMats[0];

            mat.copyFrom(this.getAbsoluteTransform());

            if (mesh && wm) {
                mat.multiplyToRef(wm, mat);
            }

            Vector3.TransformNormalToRef(localAxis, mat, result);

            result.normalize();
        }

        /**
         * Get the euler rotation of the bone in local or world space
         * @param space The space that the rotation should be in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         * @returns The euler rotation
         */
        public getRotation(space = Space.LOCAL, mesh: Nullable<AbstractMesh> = null): Vector3 {
            var result = Vector3.Zero();

            this.getRotationToRef(space, mesh, result);

            return result;
        }

        /**
         * Copy the euler rotation of the bone to a vector3.  The rotation can be in either local or world space
         * @param space The space that the rotation should be in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         * @param result The vector3 that the rotation should be copied to
         */
        public getRotationToRef(space = Space.LOCAL, mesh: Nullable<AbstractMesh> = null, result: Vector3): void {
            var quat = Bone._tmpQuat;

            this.getRotationQuaternionToRef(space, mesh, quat);

            quat.toEulerAnglesToRef(result);
        }

        /**
         * Get the quaternion rotation of the bone in either local or world space
         * @param space The space that the rotation should be in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         * @returns The quaternion rotation
         */
        public getRotationQuaternion(space = Space.LOCAL, mesh: Nullable<AbstractMesh> = null): Quaternion {
            var result = Quaternion.Identity();

            this.getRotationQuaternionToRef(space, mesh, result);

            return result;
        }

        /**
         * Copy the quaternion rotation of the bone to a quaternion.  The rotation can be in either local or world space
         * @param space The space that the rotation should be in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         * @param result The quaternion that the rotation should be copied to
         */
        public getRotationQuaternionToRef(space = Space.LOCAL, mesh: Nullable<AbstractMesh> = null, result: Quaternion): void {
            if (space == Space.LOCAL) {
                this._decompose();
                result.copyFrom(this._localRotation);
            } else {
                var mat = Bone._tmpMats[0];
                var amat = this.getAbsoluteTransform();

                if (mesh) {
                    amat.multiplyToRef(mesh.getWorldMatrix(), mat);
                } else {
                    mat.copyFrom(amat);
                }

                mat.m[0] *= this._scalingDeterminant;
                mat.m[1] *= this._scalingDeterminant;
                mat.m[2] *= this._scalingDeterminant;

                mat.decompose(undefined, result, undefined);
            }
        }

        /**
         * Get the rotation matrix of the bone in local or world space
         * @param space The space that the rotation should be in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         * @returns The rotation matrix
         */
        public getRotationMatrix(space = Space.LOCAL, mesh: AbstractMesh): Matrix {
            var result = Matrix.Identity();

            this.getRotationMatrixToRef(space, mesh, result);

            return result;
        }

        /**
         * Copy the rotation matrix of the bone to a matrix.  The rotation can be in either local or world space
         * @param space The space that the rotation should be in
         * @param mesh The mesh that this bone is attached to.  This is only used in world space
         * @param result The quaternion that the rotation should be copied to
         */
        public getRotationMatrixToRef(space = Space.LOCAL, mesh: AbstractMesh, result: Matrix): void {
            if (space == Space.LOCAL) {
                this.getLocalMatrix().getRotationMatrixToRef(result);
            } else {

                var mat = Bone._tmpMats[0];
                var amat = this.getAbsoluteTransform();

                if (mesh) {
                    amat.multiplyToRef(mesh.getWorldMatrix(), mat);
                } else {
                    mat.copyFrom(amat);
                }

                mat.m[0] *= this._scalingDeterminant;
                mat.m[1] *= this._scalingDeterminant;
                mat.m[2] *= this._scalingDeterminant;

                mat.getRotationMatrixToRef(result);
            }
        }

        /**
         * Get the world position of a point that is in the local space of the bone
         * @param position The local position
         * @param mesh The mesh that this bone is attached to
         * @returns The world position
         */
        public getAbsolutePositionFromLocal(position: Vector3, mesh: Nullable<AbstractMesh> = null): Vector3 {
            var result = Vector3.Zero();

            this.getAbsolutePositionFromLocalToRef(position, mesh, result);

            return result;
        }

        /**
         * Get the world position of a point that is in the local space of the bone and copy it to the result param
         * @param position The local position
         * @param mesh The mesh that this bone is attached to
         * @param result The vector3 that the world position should be copied to
         */
        public getAbsolutePositionFromLocalToRef(position: Vector3, mesh: Nullable<AbstractMesh> = null, result: Vector3): void {
            var wm: Nullable<Matrix> = null;

            //mesh.getWorldMatrix() needs to be called before skeleton.computeAbsoluteTransforms()
            if (mesh) {
                wm = mesh.getWorldMatrix();
            }

            this._skeleton.computeAbsoluteTransforms();

            var tmat = Bone._tmpMats[0];

            if (mesh && wm) {
                tmat.copyFrom(this.getAbsoluteTransform());
                tmat.multiplyToRef(wm, tmat);
            } else {
                tmat = this.getAbsoluteTransform();
            }

            Vector3.TransformCoordinatesToRef(position, tmat, result);
        }

        /**
         * Get the local position of a point that is in world space
         * @param position The world position
         * @param mesh The mesh that this bone is attached to
         * @returns The local position
         */
        public getLocalPositionFromAbsolute(position: Vector3, mesh: Nullable<AbstractMesh> = null): Vector3 {
            var result = Vector3.Zero();

            this.getLocalPositionFromAbsoluteToRef(position, mesh, result);

            return result;
        }

        /**
         * Get the local position of a point that is in world space and copy it to the result param
         * @param position The world position
         * @param mesh The mesh that this bone is attached to
         * @param result The vector3 that the local position should be copied to
         */
        public getLocalPositionFromAbsoluteToRef(position: Vector3, mesh: Nullable<AbstractMesh> = null, result: Vector3): void {
            var wm: Nullable<Matrix> = null;

            //mesh.getWorldMatrix() needs to be called before skeleton.computeAbsoluteTransforms()
            if (mesh) {
                wm = mesh.getWorldMatrix();
            }

            this._skeleton.computeAbsoluteTransforms();

            var tmat = Bone._tmpMats[0];

            tmat.copyFrom(this.getAbsoluteTransform());

            if (mesh && wm) {
                tmat.multiplyToRef(wm, tmat);
            }

            tmat.invert();

            Vector3.TransformCoordinatesToRef(position, tmat, result);
        }
    }
} 