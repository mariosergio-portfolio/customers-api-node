export function createCustomerController({ customerService }) {
  return {
    async search(req, res) {
      const { companyId } = req.valid.params;
      const { name, country, orderBy } = req.valid.query;
      res.json(await customerService.search({ companyId, name, country, orderBy }));
    },

    async pronounce(req, res) {
      const { customerPk } = req.valid.params;
      const { language } = req.valid.query;

      const mp3 = await customerService.pronounce(customerPk, language);

      res
        .status(200)
        .type('audio/mpeg')
        .set('Content-Disposition', `inline; filename="${customerPk}-pronounce.mp3"`)
        .send(mp3);
    },
  };
}
