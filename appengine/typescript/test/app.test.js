const {expect} = require('chai');
const waitPort = require('wait-port');

const PORT = parseInt(process.env.PORT) || 8080;

describe('server listening', () => {
  it('should be listening', async () => {
    const server = require('../index.js');
    const isOpen = await waitPort({port: PORT});
    expect(isOpen).to.be.true;
    server.close();
  });
});
