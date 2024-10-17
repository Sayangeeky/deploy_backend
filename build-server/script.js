const { exec } = require('child_process');
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const redis = require('ioredis')
require('dotenv').config()

const publisher = new redis(process.env.REDIS_URL)

publisher.on('error', (err) => {
    console.error('Redis connection error:', err);
});
publisher.on('connect', () => {
    console.log('Connected to Redis');
});


const s3Client = new S3Client({
    region:process.env.AWS_REGION,
    credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.SECRETACCESS_KEY
    }
})
const PROJECT_ID = process.env.PROJECT_ID

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

async function init(){
    console.log("Executing script.js");
    const outDirPath = path.join(__dirname,'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)
 
    p.stdout.on('data', data => {
        console.log(data.toString());
        publishLog(data.toString())
        
    })

    p.stdout.on('error', err=> {
        console.log(err.toString());
        publishLog(`error: ${err.toString()}`)
        
    })

    p.stdout.on('close', async ()=> {
        console.log('Build Complete');
        publishLog(`Build Complete`)
        const distFolderPath = path.join(__dirname,'output','dist')
        if (!fs.existsSync(distFolderPath)) {
            console.error('Error: dist folder does not exist. The build process might not have created it.');
            return;
        }
        const distFolderContents = fs.readdirSync(distFolderPath, {recursive: true})
        publishLog(`Starting to upload`)
        for(const file of distFolderContents){
            const filePath = path.join(distFolderPath,file)
            if(fs.lstatSync(filePath).isDirectory()){
                continue;
            }
            console.log('Uploading', filePath);
            publishLog(`uploading ${file}`)
            
            const command = new PutObjectCommand({
                Bucket: 'deployer01',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath),
            })

            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('Uploaded', filePath);
            
        }

        console.log('Done');
        publishLog(`Done`)
        
    })
    
    
}  

init()