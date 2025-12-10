import { LFS } from './libs/litefileserver.js';
import { UTILS } from './Utils.js';
class RemoteFileSystem {
    
    constructor( callback, folders = []) {
        this.session = null;

        this.host = "https://dev-lfs.gti.upf.edu/";
        this.root = this.host + "files/";
        
        // this.repository = {signs:[], presets: [], clips:[]};
        this.repository = [];

        this.refreshRepository = true;

        // init server this.onReady.bind(this, user, pass, (s) => {this.session = s; callback;})
        LFS.setup(this.host + "src/", () => {
            LFS.checkExistingSession( (session ) => {
                this._setSession( session );
                // if( session ) {
                //     this.loadAllUnitsFolders( () => callback( this.session ), folders );
                // }
                // else {
                    callback( this.session );
                // }
                
            }, (error) => callback(error)); 
        });        
    }
    
    _setSession( session ) {
        if( !session || !session.status ) {
            session = null;
        }

        if( session && this.session && session.user.username === this.session.user.username ) {
            return;
        }

        this.session = session;
    }

    getSession() {
        return this.session;
    }

    createAccount( user, password, email, on_complete, on_error ) {
        LFS.createAccount( user, password, email, ( valid, request ) => {
            if( !valid ) {
                if( on_error ) {
                    on_error( request );
                }
                return;
            }

            this.login(user, password, () => {
                this.loadUnits();
            
                this.createFolders();
                    
                if(on_complete) {
                    on_complete(request);
                }
            })
        }, on_error, null, null );
    }

	login( username, password, callback ) {
		if( !username || !password ) {
			return;
        }

		const inner_success = (session, response, resolve) => {
            if( response.status == 1 ) {
			    this._setSession( session );
            }
            
            if( resolve ) {
                resolve(session);
            }

			if( callback ) {
				callback(this.session, response);
            }
		}

		const inner_error = (err, resolve) => {
            if( resolve ) {
                resolve(null);
            }

			if( callback ) {
				callback(null, err);
            }
			throw err;
		}

        const promise = new Promise(resolve => {
            LFS.login(username, password, (s,r) => inner_success(s,r,resolve), (err) => inner_error(err, resolve))
        });

        return promise;
	}

    logout( callback ) {

        this.session.logout( () => {
            console.log("Logout done");
            this.session = null;
            
            const repo = {signs:[], presets: [], clips: []};

            // Only leave local and public remote files in the repo. Remove the ones from the server
            for( let folder in this.repository ) {
                if( folder == "Local" || folder == "Public" ) {
                    
                    repo[folder] = this.repository[folder];
                }
                // for( let i = 0; i < this.repository[folder].length; i++ ) {
                //     if( this.repository[folder][i].id == "Local" || this.repository[folder][i].id == "Public" ) {
                //     }
                // }
            }
            this.repository = repo;

            if( callback ) {
                callback();
            }
        });
    }

    async uploadFile(unit, folder_id, filename, data, metadata){


        return new Promise((resolve, reject) => {

            const session = this.session;
            //const unit = session.user.username;
            // const path = unit + "/" + folder + "/" + filename;
           // const path = folder + "/" + filename;

            session.uploadFile( unit, folder_id, filename, data, { "metadata": metadata }, 
                (e) => {
                    console.log("complete", e);
                    this.getFiles( unit, folder_id, (files) => {
                        const files_data = [];
                        if( files ) {                                        
                            for( let f = 0; f < files.length; f++ ) {
                                let extension = files[f].filename.substr(files[f].filename.lastIndexOf(".") + 1);
                                files[f].asset_id = files[f].id;
                                files[f].id = files[f].filename;
                                files[f].folder = folder.replace("animics/", "");
                                files[f].type = extension;
                                if(files[f].type == "txt")
                                    continue;
                                files_data.push(files[f]);
                            }
                        }
                        resolve( files_data );
                    },
                    (err) => {
                        console.error(err);
                        resolve( false );
                    } );
                },
                (e) => {
                    console.log("error", e);
                    reject(e);
                }
            );
        });
                //                    e => console.log("progress",e));
    }

    async uploadData(unit, folder_id, data, filename, metadata){

        return new Promise((resolve, reject) => {

            var session = this.session;
            //let path = session.user.username + "/" + folder + "/" + filename;

			session.uploadFile( unit, folder_id, filename, data, { "metadata": metadata }, 
                (e) => {
                    console.log("complete", e);
                    this.getFiles( unit, folder_id, (files) => {
                        const files_data = [];
                        if( files ) {                                        
                            for( let f = 0; f < files.length; f++ ) {
                                files[f].asset_id = files[f].id;
                                files[f].id = files[f].filename;
                                files[f].folder = folder.replace("animics/", "");
                                files[f].type = UTILS.getExtension(files[f].filename);
                                delete files[f].path;
                                if(files[f].type == "txt")
                                    continue;
                                files_data.push(files[f]);
                            }
                        }
                        resolve( files_data );
                    },
                    (err) => {
                        console.error(err);
                        resolve( false );
                    } );
                },
                (e) => {
                    console.log("error", e);
                    reject(e);
                }
            );
        });
    }

    // move file or rename file
    async moveFile( file_id, new_path) {
        if( !this.session ) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.session.moveFile( file_id, new_path,
                ( e ) => {
                    resolve(true);
                }, (err) => {
                    console.error( err );
                    resolve(false);
                }
            )
         });
    }

    // copy/clone file 
    async copyFile( file_id, new_path) {
        if( !this.session ) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.session.copyFile( file_id, new_path,
                ( e ) => {
                    resolve(true);
                }, (err) => {
                    console.error( err );
                    resolve(false);
                }
            )
         });
    }

    async getFiles( unit, folder_id) {
        if( !this.session ) {
            return
        }
        return new Promise((resolve, reject) => {
            this.session.getFilesInFolder( unit, folder_id, 
                ( files ) => {
                    resolve(files);
                }, (err) => {
                    console.error( err );
                    reject(err);
                }
            );
        });
    }

    async getFileInfo( id ) {
        if( !this.session ) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.session.getFileInfo( id, 
                ( info ) => {
                    resolve(info);
                }, (err) => {
                    console.error( err );
                    reject(err);
                }
            );
        });
    }

    // async getFolders( onFolders ) {
    //     const session = this.session;
    //     session.getUnitsAndFolders(onFolders);
    // }

    async createFolders() {
        const session = this.session;
        if( !session ) {
            return;
        }

        await session.createFolder( session.user.username + "/animics/clips/", (v, r) => {console.log(v)} );
        await session.createFolder( session.user.username + "/animics/scripts/presets/", (v, r) => {console.log(v)} );
        await session.createFolder( session.user.username + "/animics/scripts/signs/", (v, r) => {console.log(v)} );
    }

    async createFolder( fullpath ) {
        return new Promise( (resolve, reject) => {
            const session = this.session;
            if( !session ) {
                reject( "no session" );
            }
            session.createFolder( fullpath,
                (v, r) => {
                    resolve(v);
                    console.log(v);
                },
                (err) => {
                    reject( err );
                }
            );
        })
    }

    // move folder or rename folder
    async moveFolder( folder_id, unit, new_path) {
        if( !this.session ) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.session.moveFolder( folder_id, unit, new_path,
                ( e ) => {
                    resolve(true);
                }, (err) => {
                    console.error( err );
                    resolve(false);
                }
            )
         });
    }

    async deleteFolder( folder_id, unit ) {
        return new Promise( (resolve, reject) => {
            const session = this.session;
            if( !session ) {
                reject( "no session" );
            }
            session.deleteFolder( folder_id, unit,
                (v, r) => {
                    resolve(v);
                    console.log(v, r);
                },
                (err) => {
                    reject( err );
                }
            );
        })
    }

    async loadUnits() {
        // this.repository = {signs:[], presets: [], clips: []};
        this.repository = [];
        const session = this.session;
        if( !session ) {
            return;
        }
        return new Promise( resolve => {
            session.getUnits( (units) => {
                for( let i = 0; i < units.length; i++ ) {
                    if(units[i].name == "guest") {
                        continue;
                    }
                    const data = {
                        id: units[i].name,
                        type: "folder",
                        unit: units[i].name,
                        mode: units[i].mode,
                        children: []
                    };
    
                    this.repository.push( data );
                    // this.repository.signs.push( Object.assign( {}, data ) );
                    // this.repository.presets.push( Object.assign( {}, data ) );
                    // this.repository.clips.push( Object.assign( {}, data ) );
                }
                resolve();
            });
        })
        
    }

    //Get folders from each user unit
    async loadFolders(unit, folder_id, allowFolders) {
        if( !this.session ) {
            return;
        }
        return new Promise( async (resolve, reject) => {

            await this.session.getFolder(unit, folder_id, async ( folders ) =>  {
                const data = [];
                for(let i = 0; i < folders.length; i++) {
                    data.push(this.parseAssetInfo(unit, folders[i], folders[i].folder, allowFolders));
                }
                console.log(folders)
                // const data = folders.length ? this.parseAssetInfo(unit.id, folders[0], folders[0].folder, allowFolders) : [];
                resolve( data );
            })
        })
    }

    async loadAssets( unit, folder_id, allowFolders = [] ) {
    
        const session = this.session;
        if( !session || folder_id == null ) {
            return;
        }
        return new Promise( (resolve, reject) => {

            session.getFilesInFolder( unit, folder_id,
                (files) => {
                    const files_data = [];
                    if( files ) {                                        
                        for( let f = 0; f < files.length; f++ ) {
                            let extension = files[f].filename.substr(files[f].filename.lastIndexOf(".") + 1);
                            files[f].asset_id = files[f].id;
                            files[f].id = files[f].filename;
                            files[f].folder = files[f].folder;
                            files[f].type = extension;
                            files[f].children = [];
                            delete files[f].path;
                            if(files[f].type == "txt")
                                continue;
                            files_data.push(files[f]);
                        }
                    }
                    resolve( files_data );
                },
                (err) => reject(err)
            )
        })
    }

    async loadAllUnitsFolders( callback, allowFolders = [] ) {
        await this.loadUnits();
        const session = this.session;
        if( !session ) {
            callback();
            return;
        }

        let count = 0;

        for( let i = 0; i < this.repository.length; i++ ) {
            const unit = this.repository[i];
            const unitName = unit.id;
            const unitMode = unit.mode;
            
            await session.getFoldersTree( unitName, async ( folders ) =>  {

                
                console.log(folders)
                const data = {id: unitName, type: "folder", folder: null, children: [], unit: unitName, mode: unitMode};
                if( folders.length ) {
                    folders = folders.filter( ( folder ) => folder.folder == "animics");
                    if ( folders.length ) {
                        data.children.push(this.parseAssetInfo(unit.id, folders[0], unitName, allowFolders));
                    }
                }
                
                console.log(data)
                
                this.repository[i] = data;
                count++;

                if( count == this.repository.length ) {
                    // this.repository.push(this.localStorage);
                    
                    if( callback ) {
                        callback();
                    }
                }
            })
        }
    }

    async loadFoldersAndFiles(unit, folder_id, folder, allowFolders) {

        if( !this.session ) {
            return;
        }

        return new Promise( async (resolve, reject) => {
            const files = await this.loadAssets(unit, folder_id, allowFolders);
            const folders = await this.loadFolders(unit, folder_id, allowFolders);
            const data = [...folders, ...files];
            resolve(data);            
        })
    }

    parseAssetInfo(unit, asset, path, allowFolders = []) {
        //const extraData = [];
     
        const data = {id: null, type: null, folder: null, children: [], unit: unit, fullpath: path};
        let type = "folder";
        let name = "";
                            
        if( asset.subfolders ) {
            name = asset.folder;
            data.fullpath = unit + "/" + asset.path;
            if( asset.folder == "presets" ) {
                data.icon = "Tags";
            }
            else if( asset.folder == "signs") {
                data.icon = "HandsAslInterpreting";
            }
            else if( asset.folder == "clips") {
                data.icon = "ClapperboardClosed";
            }
            
            for( let i = 0; i < asset.subfolders.length; i++ ) {
                const subfolder = asset.subfolders[i];
                if( allowFolders.length && allowFolders.indexOf(subfolder.folder) < 0) {
                    continue;
                }

                data.children.push( this.parseAssetInfo(unit, subfolder, data.fullpath) );
            }
        }
        else {
            name = asset.filename;
            type = UTILS.getExtension( name );
        }

        data.type = type;
        data.id = name;
        data.asset_id = asset.id;
        //data.fullpath = unit + "/" + asset.fullpath;
        
        return data;
    }

    deleteFile( file_id ) {
        const session = this.session;
        if( !session ) {
            return;
        }

        new Promise( (resolve, reject) => {
            session.deleteFile( file_id, 
                (deleted) => {
                    resolve( deleted );
                },
                (err) => {
                    reject( err );
                }
                // if( deleted ) {
                //     // const url = fullpath.split("/");
                //     // const unit = url[0];
                //     // url.pop();
                //     // url = url.slice(1);
                //     // const folder = url.join("/");
                //     // this.getFiles( unit, folder, (files) => {
                //     //     const files_data = [];
                //     //     if( files ) {                                        
                //     //         for( let f = 0; f < files.length; f++ ) {
                //     //             let extension = files[f].filename.substr(files[f].filename.lastIndexOf(".") + 1);
                //     //             files[f].id = files[f].filename;
                //     //             files[f].folder = folder.replace("animics/", "");
                //     //             files[f].type = extension;
                //     //             if(files[f].type == "txt")
                //     //                 continue;
                //     //             files_data.push(files[f]);
                //     //         }
                //     //     }
                //     //     callback( files_data );
                //     // },
                //     // (err) => {
                //     //     console.error(err);
                //     //     callback( false );
                //     // } );
                // }
                // else {
                //     callback( deleted );
                // }
            )})
    }
}

export { RemoteFileSystem };