const { 
  KeyHelper, 
  SessionBuilder, 
  SessionCipher, 
  SignalProtocolAddress 
} = require('@privacyresearch/libsignal-protocol-typescript');
const { Buffer } = require('buffer');

// 1. A Simple In-Memory Signal Store for Testing
class InMemorySignalStore {
  constructor() {
    this.store = {};
  }
  async getIdentityKeyPair() { return this.store['identityKey']; }
  async getLocalRegistrationId() { return this.store['registrationId']; }
  async put(key, value) { this.store[key] = value; }
  async get(key) { return this.store[key]; }
  async remove(key) { delete this.store[key]; }

  async loadSession(identifier) { return this.store['session' + identifier]; }
  async storeSession(identifier, record) { this.store['session' + identifier] = record; }
  
  async loadPreKey(keyId) { return this.store['25519KeypreKey' + keyId]; }
  async storePreKey(keyId, keyPair) { this.store['25519KeypreKey' + keyId] = keyPair; }
  
  async loadSignedPreKey(keyId) { return this.store['25519KeysignedKey' + keyId]; }
  async storeSignedPreKey(keyId, keyPair) { this.store['25519KeysignedKey' + keyId] = keyPair; }

  async saveIdentity(identifier, identityKey) {
    this.store['identityKey' + identifier] = identityKey;
    return true;
  }
  async isTrustedIdentity(identifier, identityKey, direction) { return true; }
  async loadIdentityKey(identifier) { return this.store['identityKey' + identifier]; }
}

async function runSimulation() {
  console.log('🚀 Iniciando Simulação de Encriptação Ponta-a-Ponta (Signal Protocol)...\n');

  // --- FASE 1: Alice gera as suas chaves (Como ocorre no Login da App) ---
  console.log('--- FASE 1: ALICE GERA AS CHAVES ---');
  const aliceStore = new InMemorySignalStore();
  
  const registrationId = KeyHelper.generateRegistrationId();
  await aliceStore.put('registrationId', registrationId);
  console.log('✅ Alice gerou Registration ID:', registrationId);

  const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
  await aliceStore.put('identityKey', identityKeyPair);
  console.log('✅ Alice gerou Identity Key (Chave de Identidade)');

  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, 1);
  await aliceStore.storeSignedPreKey(1, signedPreKey.keyPair);
  console.log('✅ Alice gerou Signed PreKey');

  const preKey = await KeyHelper.generatePreKey(1);
  await aliceStore.storePreKey(1, preKey.keyPair);
  console.log('✅ Alice gerou PreKey');

  // Alice "envia" este pacote de chaves públicas para o Backend.
  const aliceBundle = {
    registrationId: registrationId,
    identityKey: identityKeyPair.pubKey,
    signedPreKey: {
      keyId: 1,
      publicKey: signedPreKey.keyPair.pubKey,
      signature: signedPreKey.signature
    },
    preKey: {
      keyId: 1,
      publicKey: preKey.keyPair.pubKey
    }
  };
  console.log('📡 Alice enviou as chaves públicas para o servidor.\n');


  // --- FASE 2: Bob quer enviar uma mensagem à Alice ---
  console.log('--- FASE 2: BOB CONSTRÓI A SESSÃO ---');
  const bobStore = new InMemorySignalStore();
  const bobRegistrationId = KeyHelper.generateRegistrationId();
  await bobStore.put('registrationId', bobRegistrationId);
  const bobIdentity = await KeyHelper.generateIdentityKeyPair();
  await bobStore.put('identityKey', bobIdentity);
  console.log('✅ Bob gerou as suas próprias chaves de Identidade e Registration ID.');

  const aliceAddress = new SignalProtocolAddress('+258840000000', 1); // ID da Alice

  // Bob constrói a sessão usando as chaves públicas da Alice
  const bobSessionBuilder = new SessionBuilder(bobStore, aliceAddress);
  await bobSessionBuilder.processPreKey(aliceBundle);
  console.log('✅ Bob construiu a sessão segura com as chaves públicas da Alice.\n');


  // --- FASE 3: Bob Encripta a Mensagem ---
  console.log('--- FASE 3: ENCRIPTAR MENSAGEM (BOB -> ALICE) ---');
  const mensagemOriginal = "Olá Alice, esta é uma mensagem super secreta!";
  console.log('📝 Mensagem original:', mensagemOriginal);

  const bobCipher = new SessionCipher(bobStore, aliceAddress);
  // Need to pass ArrayBuffer!
  const mensagemArrayBuffer = new TextEncoder().encode(mensagemOriginal).buffer;
  const mensagemEncriptada = await bobCipher.encrypt(mensagemArrayBuffer);
  
  console.log('🔒 Mensagem encriptada (Ciphertext):');
  console.log(mensagemEncriptada.body.substring(0, 50) + '... (truncado)');
  console.log('Tipo de mensagem:', mensagemEncriptada.type === 3 ? 'PreKey (Primeira)' : 'Normal');
  console.log('\n');


  // --- FASE 4: Alice Desencripta a Mensagem ---
  console.log('--- FASE 4: DESENCRIPTAR MENSAGEM (ALICE LÊ) ---');
  const aliceCipher = new SessionCipher(aliceStore, aliceAddress);
  
  let textoDesencriptadoBuffer;
  if (mensagemEncriptada.type === 3) {
    // É uma mensagem do tipo PreKeyMessage (normalmente a primeira)
    textoDesencriptadoBuffer = await aliceCipher.decryptPreKeyWhisperMessage(mensagemEncriptada.body, 'binary');
  } else {
    textoDesencriptadoBuffer = await aliceCipher.decryptWhisperMessage(mensagemEncriptada.body, 'binary');
  }

  const textoDesencriptado = Buffer.from(textoDesencriptadoBuffer).toString('utf8');
  console.log('🔓 Alice leu a mensagem:', textoDesencriptado);

  if (textoDesencriptado === mensagemOriginal) {
    console.log('\n🎉 SUCESSO! A criptografia End-to-End está a funcionar corretamente!');
  } else {
    console.log('\n❌ FALHA! As mensagens não coincidem.');
  }
}

runSimulation().catch(err => {
  console.error('Ocorreu um erro na simulação:', err);
});
